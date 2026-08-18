/** بيانات المزودين الآمنة للمتصفح — بلا أي مفاتيح أو مصطلحات تقنية. */
export const MAIL_PROVIDERS = ["gmail", "microsoft", "other"] as const;
export type MailProvider = (typeof MAIL_PROVIDERS)[number];

export const MAIL_PROVIDER_LABEL: Record<MailProvider, string> = {
  gmail: "Gmail",
  microsoft: "Microsoft / Outlook",
  other: "بريد آخر",
};

/** أقل الصلاحيات العملية: قراءة + إرسال فقط. */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

export const MICROSOFT_SCOPES = ["offline_access", "Mail.Read", "Mail.Send", "User.Read"];
