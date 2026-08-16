# تقرير إغلاق — الاتصال الداخلي وصندوق الطلبات (جولة التصحيح)

نطاق هذه الجولة: تقوية وحدة الاتصال الصوتي الداخلي، عزل صندوق الطلبات، وتوازن لوحة التحكم والتنقل. لا نشر، ولا تغيير على وحدات أخرى.

## 1. قاعدة البيانات — `call_sessions`

- حقول غير قابلة للتعديل من العميل إطلاقًا (يرفع الحاجز استثناءً عند أي محاولة):
  `appointment_id`, `caller_entity_id`, `callee_entity_id`, `caller_user_id`,
  `answered_user_id`, `started_at`, `accepted_at`, `ended_at`, `duration_seconds`, `created_at`.
  كل قيمة زمنية أو حسابية يكتبها الحاجز نفسه (`statement_timestamp()`) لا العميل.
- آلة الحالات المسموح بها حصرًا:
  - `ringing → accepted | declined`: عضو فعّال في كيان المستقبِل فقط، ويُسجَّل `answered_user_id = auth.uid()`.
  - `ringing → ended | cancelled`: صاحب المكالمة (`caller_user_id`) فقط.
  - `ringing → missed`: ممنوعة قبل مرور **60 ثانية** على `started_at`.
  - `accepted → ended`: الشخصان المشاركان فعليًا فقط (`caller_user_id` أو `answered_user_id`) — لا يكفي أن يكون المستخدم زميلًا في الكيان.
  - أي انتقال آخر يرفع استثناءً.
- `duration_seconds` تُحسب خادميًا من `accepted_at` عند الإنهاء فقط.
- `end_reason` مقيّدة بقائمة: `hangup | declined | missed | failed | cancelled`.
- فهرس فريد جزئي `call_sessions_active_uniq (appointment_id) where status in ('ringing','accepted')`:
  مكالمة نشطة واحدة لكل موعد.
- مفاتيح أجنبية رسمية إلى `auth.users` (`caller_user_id` cascade، `answered_user_id` set null).
- عند أي حالة نهائية تُحذف كل صفوف `call_signals` للجلسة تلقائيًا.

## 2. قاعدة البيانات — `call_signals`

- سياسة القراءة والكتابة لم تعد "أي عضو في الكيان": الشخصان المشاركان فقط
  (`caller_user_id` / `answered_user_id`).
- قواعد لكل نوع إشارة:
  - `offer`: المتصل فقط، ومن كيان المتصل.
  - `answer`: المستقبِل الذي ردّ فعليًا، وبعد `accepted` فقط.
  - `ice`: المتصل دائمًا، والمستقبِل بعد القبول فقط.
  - `hangup`: أي من الطرفين المشاركين.
- الحذف اليدوي ممنوع: `drop policy call_signals_delete` + `revoke delete`. التنظيف تلقائي عبر الحاجز.
- تحقق من شكل الحمولة (`call_signals_payload_shape_chk`): `offer/answer` تتطلب `type` و`sdp` نصيّين،
  `ice` تتطلب كائن `candidate`، و`hangup` حمولتها `{}` بالضبط. سقف الحجم 16KB باقٍ.

## 3. الصلاحيات (تحقق فعلي)

```
call_sessions : authenticated = a r w x t m   (لا delete، لا truncate)   anon = لا شيء
call_signals  : authenticated = a r x t m     (لا update، لا delete)     anon = لا شيء
```

`private.enforce_call_session_flow()` مسحوبة EXECUTE من `public, anon, authenticated`
(تعمل كحاجز فقط)، و`private.is_active_member` تحتفظ بالمنح الصريح المطلوب لتعبيرات السياسات.

## 4. الطبقة الخادمية

- `respondToCall`: يستخدم `.select()` للتحقق من عدد الصفوف المتأثرة؛ صفر صفوف = خطأ عربي واضح
  «المكالمة لم تعد متاحة» بدل نجاح كاذب.
- `endCall`: يميّز الإلغاء أثناء الرنين (`cancelled`) عن الإنهاء بعد القبول (`ended`)، ويثبّت
  `end_reason`، ويشترط بقاء الحالة كما قُرئت (`.eq('status', row.status)`).
- `getCallCenter`: يحصد المكالمات الرنانة الأقدم من 60 ثانية ويحوّلها إلى `missed` قبل العرض،
  فلا تبقى لافتة رنين معلّقة.
- لا يُسجَّل أي SDP أو ICE أو رقم جوال في أي مسار خادمي؛ المحفوظ بيانات وصفية فقط.

## 5. عزل صندوق الطلبات

`listInboxRequests` أصبح يشتق أولًا قائمة المشاريع التي يشارك فيها الحساب النشط فعليًا
(مالك المشروع `projects.entity_id`، أو طرف مشروع غير منتهٍ في `project_parties`)،
ثم يقصر الاستعلام عليها عبر `.in('project_id', …)`. مطابقة `assigned_user_id` وحدها
لم تعد توسّع النطاق عبر الكيانات. عند غياب مشاريع للكيان تُعاد قائمة فارغة فورًا.

## 6. الواجهة

- لافتة المكالمة الواردة في الهيكل: زر **قبول** حقيقي ينتقل إلى `/calls?answer=<id>` ويردّ تلقائيًا،
  وزر **رفض** ينفّذ `respondToCall(accept:false)` مباشرة.
- WebRTC: طابور مرشحات ICE قبل وصول الوصف البعيد (بدلًا من إسقاطها صامتًا)، واشتراك على تحديثات
  `call_sessions` لإنهاء الطرف المحلي فور رفض/إلغاء/إنهاء الطرف الآخر، وإرسال إشارة `hangup` قبل الإغلاق.
- التنقل: شريط سطح المكتب ينتقل إلى `lg` وشريط الجوال السفلي يظهر دون `lg` — لا تزاحم عند 768/1024.
- لوحة التحكم: أربعة إجراءات متوازنة لكل المستخدمين + زر «مشروع جديد» بجوار البحث.
- المواعيد: زر «اتصال صوتي» على كل موعد مؤكد.
- إضافة ترجمة الحالة `cancelled` (عربي/إنجليزي) في `calls.statuses`.

## 7. التحقق

- `bunx tsgo --noEmit`: نجاح بلا أخطاء.
- `bun run build`: نجاح.
- لا أرقام عربية/فارسية مضافة: كل الأرقام تمر عبر `src/lib/format.ts` و`formatCallDuration`.
