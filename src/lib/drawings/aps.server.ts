/**
 * محوّل Autodesk APS — خادمي فقط.
 *
 * fail-closed: لا يجري أي طلب شبكي إطلاقًا ما لم تتحقق ثلاثة شروط معًا:
 *   1) متغير البيئة APS_ENABLED = "true"
 *   2) drawing_module_settings.aps_enabled = true في القاعدة
 *   3) وجود قيمتَي APS_CLIENT_ID و APS_CLIENT_SECRET في بيئة الخادم
 *
 * الافتراضي معطّل، ولا يوجد إرسال خارجي في هذه المرحلة.
 */

export interface ApsGateResult {
  ready: boolean;
  /** سبب المنع بلغة مفاتيح الترجمة، أو null عند الجاهزية. */
  reasonKey:
    | "drawings.apsEnvDisabled"
    | "drawings.apsSettingDisabled"
    | "drawings.apsSecretsMissing"
    | null;
}

export function evaluateApsGate(settingEnabled: boolean): ApsGateResult {
  if (process.env["APS_ENABLED"] !== "true") {
    return { ready: false, reasonKey: "drawings.apsEnvDisabled" };
  }
  if (!settingEnabled) {
    return { ready: false, reasonKey: "drawings.apsSettingDisabled" };
  }
  if (!process.env["APS_CLIENT_ID"] || !process.env["APS_CLIENT_SECRET"]) {
    return { ready: false, reasonKey: "drawings.apsSecretsMissing" };
  }
  return { ready: true, reasonKey: null };
}

export interface ApsTranslateResult {
  submitted: boolean;
  reasonKey: string | null;
}

/**
 * نقطة الإرسال المستقبلية. حاليًا لا ترسل شيئًا: تتوقف عند البوابة، وحتى عند
 * تحقق الشروط تُعيد "غير مُرسَل" لأن الاتفاقية الرسمية مع المزوّد لم تُوقَّع بعد.
 */
export async function submitTranslationJob(params: {
  settingEnabled: boolean;
  storagePath: string;
}): Promise<ApsTranslateResult> {
  const gate = evaluateApsGate(params.settingEnabled);
  if (!gate.ready) return { submitted: false, reasonKey: gate.reasonKey };
  return { submitted: false, reasonKey: "drawings.apsNoAgreement" };
}
