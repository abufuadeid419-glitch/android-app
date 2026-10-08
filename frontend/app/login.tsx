import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { TextInput, useWindowDimensions, View } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { KeyboardScreen } from "@/src/components/KeyboardScreen";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Btn, Field, Ionicons, T } from "@/src/ui";

const HERO =
  "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

export default function Login() {
  return <PhoneAuth />;
}

// Hero collapses smoothly into a compact title bar while the keyboard is open, so the form and CTA
// keep their full size instead of being squished.
function Hero() {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const styles = useStyles();
  const { colors } = useTheme();
  const { progress } = useReanimatedKeyboardAnimation();
  const full = Math.min(winH * 0.38, 340);
  const compact = insets.top + 72;
  const box = useAnimatedStyle(() => ({ height: interpolate(progress.value, [0, 1], [full, compact]) }));
  const fade = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0, 0.5], [1, 0]), transform: [{ scale: interpolate(progress.value, [0, 1], [1, 0.9]) }] }));
  return (
    <Animated.View style={[styles.hero, box]} testID="login-hero">
      <Image source={{ uri: HERO }} style={StyleFill} contentFit="cover" />
      <LinearGradient colors={["rgba(25,28,27,0.15)", "rgba(25,28,27,0.85)"]} style={StyleFill} />
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, flex: 1, justifyContent: "flex-end", paddingBottom: spacing.lg }}>
        <Animated.View style={[styles.logo, fade]}>
          <Ionicons name="business" size={30} color={colors.onBrandPrimary} />
        </Animated.View>
        <T v="display" color="onSurfaceInverse">النظام الذكي</T>
        <Animated.View style={fade}>
          <T color="onSurfaceInverse" style={{ opacity: 0.9 }}>نظام متكامل لإدارة المبيعات والتوزيع</T>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const StyleFill = { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 };

function Features() {
  const styles = useStyles();
  const { colors } = useTheme();
  const features: { icon: any; text: string }[] = [
    { icon: "cube-outline", text: "إدارة المخزون والمنتجات" },
    { icon: "receipt-outline", text: "فواتير المبيعات والتحصيل" },
    { icon: "people-outline", text: "الموزعون والمحاسبون والعملاء" },
  ];
  return (
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
  );
}

const DEFAULT_CC = "+963";
const RESEND_SECONDS = 60;

// Phone → SMS code → name (first login only). Each step: scrollable form + sticky footer (error + CTA).
function PhoneAuth() {
  const { user, busy, error, requestOtp, verifyOtp, saveName, logout } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const [cc, setCc] = useState(DEFAULT_CC);
  const [local, setLocal] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
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
  const send = async () => {
    const ch = await requestOtp(sentTo ?? phone);
    if (ch) {
      setSentTo(sentTo ?? phone);
      setCode("");
      setWait(RESEND_SECONDS);
    }
  };

  const err = !!error && <T testID="login-error" color="error" style={{ textAlign: "center" }}>{error}</T>;
  const screen = (testID: string, body: React.ReactNode, footer: React.ReactNode) => (
    <KeyboardScreen testID="login-screen" header={<Hero />} footer={footer} contentContainerStyle={styles.body}>
      <View style={{ gap: spacing.md }} testID={testID}>{body}</View>
    </KeyboardScreen>
  );

  if (user && !user.name) {
    return screen(
      "name-step",
      <>
        <T v="h2">مرحباً بك! ما اسمك؟</T>
        <Field testID="login-name-input" label="الاسم الكامل" value={name} onChangeText={setName} placeholder="مثال: أحمد محمد" autoFocus returnKeyType="done" onSubmitEditing={() => saveName(name)} />
      </>,
      <>
        {err}
        <Btn testID="login-name-submit" title="متابعة" icon="arrow-back" loading={busy} disabled={name.trim().length < 2} onPress={() => saveName(name)} />
        <Btn testID="login-name-logout" variant="ghost" small title="تسجيل الخروج" onPress={logout} />
      </>,
    );
  }

  if (sentTo) {
    return screen(
      "code-step",
      <>
        <T v="h2">أدخل رمز التحقق</T>
        <View testID="login-sent-via" style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.brandPrimary} />
          <T v="caption" style={{ flex: 1 }}>أرسلنا رمزاً مكوناً من 6 أرقام عبر رسالة SMS إلى <T v="label" style={{ writingDirection: "ltr" }}>{sentTo}</T></T>
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
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Btn testID="login-change-phone" variant="ghost" small title="تغيير الرقم" onPress={() => setSentTo(null)} />
          <Btn testID="login-resend-button" variant="ghost" small title={wait > 0 ? `إعادة الإرسال خلال ${wait} ث` : "إعادة إرسال الرمز"} disabled={wait > 0 || busy} onPress={send} />
        </View>
      </>,
      <>
        {err}
        <Btn testID="login-verify-button" title="تحقق ودخول" icon="checkmark" loading={busy} disabled={code.length !== 6} onPress={() => verifyOtp(sentTo, code)} />
      </>,
    );
  }

  return screen(
    "phone-step",
    <>
      <Features />
      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
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
            onSubmitEditing={send}
            style={[inputStyle(colors), { flex: 1, textAlign: "left", writingDirection: "ltr" }]}
          />
        </View>
      </View>
    </>,
    <>
      {err}
      <Btn testID="login-send-code-button" title="إرسال رمز التحقق" icon="chatbubble-ellipses-outline" loading={busy} disabled={local.replace(/\D/g, "").length < 6} onPress={send} />
      <T v="caption" style={{ textAlign: "center" }}>بالمتابعة أنت توافق على شروط الاستخدام وسياسة الخصوصية</T>
    </>,
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
  hero: { overflow: "hidden", backgroundColor: c.surfaceInverse },
  logo: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  body: { padding: spacing.xl, gap: spacing.xl },
  fIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
}));
