import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Btn, Field, Ionicons, T } from "@/src/ui";

const HERO =
  "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

export default function Login() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const features: { icon: any; text: string }[] = [
    { icon: "cube-outline", text: "إدارة المخزون والمنتجات" },
    { icon: "receipt-outline", text: "فواتير المبيعات والتحصيل" },
    { icon: "people-outline", text: "الموزعون والمحاسبون والعملاء" },
  ];
  return (
    <View style={styles.root} testID="login-screen">
      <View style={styles.hero}>
        <Image source={{ uri: HERO }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
        <LinearGradient colors={["rgba(25,28,27,0.15)", "rgba(25,28,27,0.85)"]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ paddingTop: insets.top + spacing.xl, paddingHorizontal: spacing.xl, flex: 1, justifyContent: "flex-end", paddingBottom: spacing.xl }}>
          <View style={styles.logo}>
            <Ionicons name="business" size={30} color={colors.onBrandPrimary} />
          </View>
          <T v="display" color="onSurfaceInverse">النظام الذكي</T>
          <T color="onSurfaceInverse" style={{ opacity: 0.9 }}>نظام متكامل لإدارة المبيعات والتوزيع</T>
        </View>
      </View>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={{ gap: spacing.md }}>
          {features.map((f) => (
            <View key={f.text} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={styles.fIcon}>
                <Ionicons name={f.icon} size={20} color={colors.brandPrimary} />
              </View>
              <T v="label">{f.text}</T>
            </View>
          ))}
        </View>
        <PhoneAuth />
      </KeyboardAwareScrollView>
    </View>
  );
}

const DEFAULT_CC = "+963";
const RESEND_SECONDS = 60;

// Phone → SMS code (Bird Verify) → name (first login only).
function PhoneAuth() {
  const { user, busy, error, requestOtp, verifyOtp, saveName, logout } = useAuth();
  const { colors } = useTheme();
  const [cc, setCc] = useState(DEFAULT_CC);
  const [local, setLocal] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [via, setVia] = useState<"sms" | "whatsapp">("sms");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const ccDigits = cc.replace(/\D/g, "");
  // Accept "0947…", "947…", "963947…" or "00963947…" in the local field.
  const localDigits = local.replace(/\D/g, "").replace(/^00/, "").replace(new RegExp(`^${ccDigits}(?=\\d{7,})`), "").replace(/^0+/, "");
  const phone = `+${ccDigits}${localDigits}`;
  const send = async (channel?: "whatsapp") => {
    const ch = await requestOtp(sentTo ?? phone, channel);
    if (ch) {
      setVia(ch);
      setSentTo(sentTo ?? phone);
      setCode("");
      setWait(RESEND_SECONDS);
    }
  };

  const err = !!error && <T testID="login-error" color="error" style={{ textAlign: "center" }}>{error}</T>;
  const terms = <T v="caption" style={{ textAlign: "center" }}>بالمتابعة أنت توافق على شروط الاستخدام وسياسة الخصوصية</T>;

  if (user && !user.name) {
    return (
      <View style={{ gap: spacing.md }} testID="name-step">
        <T v="h2">مرحباً بك! ما اسمك؟</T>
        <Field testID="login-name-input" label="الاسم الكامل" value={name} onChangeText={setName} placeholder="مثال: أحمد محمد" autoFocus returnKeyType="done" onSubmitEditing={() => saveName(name)} />
        {err}
        <Btn testID="login-name-submit" title="متابعة" icon="arrow-back" loading={busy} disabled={name.trim().length < 2} onPress={() => saveName(name)} />
        <Btn testID="login-name-logout" variant="ghost" title="تسجيل الخروج" onPress={logout} />
      </View>
    );
  }

  if (sentTo) {
    return (
      <View style={{ gap: spacing.md }} testID="code-step">
        <T v="h2">أدخل رمز التحقق</T>
        <View testID="login-sent-via" style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Ionicons name={via === "whatsapp" ? "logo-whatsapp" : "chatbubble-ellipses-outline"} size={18} color={via === "whatsapp" ? "#25D366" : colors.brandPrimary} />
          <T v="caption" style={{ flex: 1 }}>أرسلنا رمزاً مكوناً من 6 أرقام عبر {via === "whatsapp" ? "واتساب" : "رسالة SMS"} إلى <T v="label" style={{ writingDirection: "ltr" }}>{sentTo}</T></T>
        </View>
        <Field
          testID="login-code-input"
          label="رمز التحقق"
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={6}
          autoFocus
          placeholder="••••••"
          style={{ textAlign: "center", letterSpacing: 8, fontSize: 22 }}
          onSubmitEditing={() => code.length === 6 && verifyOtp(sentTo, code)}
        />
        {err}
        <Btn testID="login-verify-button" title="تحقق ودخول" icon="checkmark" loading={busy} disabled={code.length !== 6} onPress={() => verifyOtp(sentTo, code)} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Btn testID="login-change-phone" variant="ghost" small title="تغيير الرقم" onPress={() => setSentTo(null)} />
          <Btn testID="login-resend-button" variant="ghost" small title={wait > 0 ? `يمكنك إعادة الإرسال خلال ${wait} ثانية` : "إعادة إرسال الرمز"} disabled={wait > 0 || busy} onPress={() => send()} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }} testID="phone-step">
      <T v="label" color="onSurfaceSecondary">رقم الهاتف</T>
      <View style={{ flexDirection: "row-reverse", gap: spacing.sm }}>
        <TextInput
          testID="login-country-code-input"
          value={cc}
          onChangeText={(t) => setCc("+" + t.replace(/\D/g, "").slice(0, 4))}
          keyboardType="phone-pad"
          style={[inputStyle(colors), { width: 84, textAlign: "center" }]}
        />
        <TextInput
          testID="login-phone-input"
          value={local}
          onChangeText={(t) => setLocal(t.replace(/[^\d]/g, "").slice(0, 12))}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder="9XXXXXXXX"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          onSubmitEditing={() => send()}
          style={[inputStyle(colors), { flex: 1, textAlign: "left", writingDirection: "ltr" }]}
        />
      </View>
      {err}
      <Btn testID="login-send-code-button" title="إرسال رمز التحقق" icon="chatbubble-ellipses-outline" loading={busy} disabled={local.replace(/\D/g, "").length < 6} onPress={() => send()} />
      {terms}
    </View>
  );
}

const inputStyle = (c: any) => ({
  minHeight: 50,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: c.border,
  backgroundColor: c.surfaceSecondary,
  paddingHorizontal: spacing.md,
  fontFamily: fonts.regular,
  fontSize: 17,
  color: c.onSurface,
});

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { flex: 1.1, overflow: "hidden" },
  logo: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  body: { flexGrow: 1, padding: spacing.xl, justifyContent: "space-between", gap: spacing.xl },
  fIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
}));
