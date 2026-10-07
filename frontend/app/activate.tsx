import { useState } from "react";
import { Linking, Modal, View } from "react-native";
import { CameraView, scanFromURLAsync, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { spacing, useTheme } from "@/src/theme";
import { Btn, Card, Field, Header, IconBtn, T, useToast } from "@/src/ui";

export default function Activate() {
  const { user, setUser, logout } = useAuth();
  const [code, setCode] = useState("");
  const [org, setOrg] = useState("");
  const [loading, setLoading] = useState<"code" | "trial" | null>(null);
  const [scan, setScan] = useState(false);
  const [importing, setImporting] = useState(false);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const run = async (kind: "code" | "trial", valueOverride?: string) => {
    const theCode = (valueOverride ?? code).trim();
    if (kind === "code" && !theCode) return toast("أدخل رمز التفعيل", "error");
    if (kind === "trial" && !org.trim()) return toast("أدخل اسم المؤسسة", "error");
    setLoading(kind);
    try {
      const u = kind === "code"
        ? await api("/activate", { method: "POST", body: { code: theCode } })
        : await api("/trial", { method: "POST", body: { org_name: org } });
      toast("تم تفعيل الحساب بنجاح");
      setUser(u);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setLoading(null);
    }
  };

  // Let the employee pick a screenshot/photo of the QR from their gallery and decode it — handy when
  // the invite arrived as an image (e.g. over WhatsApp) on the same phone they're signing in with.
  const importQr = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
      if (res.canceled || !res.assets?.[0]) return;
      setImporting(true);
      const found = await scanFromURLAsync(res.assets[0].uri, ["qr"]);
      const data = found?.[0]?.data?.trim();
      if (!data) { toast("لم يتم العثور على رمز QR في الصورة", "error"); return; }
      const v = data.toUpperCase();
      setCode(v);
      await run("code", v);
    } catch {
      toast("تعذّر قراءة الصورة، جرّب صورة أوضح", "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="activation-screen">
      <Header title="تفعيل الحساب" subtitle={user?.email} right={<IconBtn testID="activation-logout-button" icon="log-out-outline" onPress={logout} />} />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
        <Card style={{ gap: spacing.md }}>
          <T v="h2">لديك رمز تفعيل؟</T>
          <T v="caption">أدخل رمز ترخيص المؤسسة (LIC-...) إذا كنت مالكاً، أو رمز الموظف (EMP-...) الذي أرسله لك المدير.</T>
          <Field testID="activation-code-input" label="رمز التفعيل" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="EMP-XXXX-XXXX-XXXX" />
          <Btn testID="activate-code-button" title="تفعيل" icon="key-outline" onPress={() => run("code")} loading={loading === "code"} />
          <Btn testID="scan-qr-button" variant="secondary" icon="qr-code-outline" title="مسح رمز QR بالكاميرا" onPress={() => setScan(true)} />
          <Btn testID="import-qr-button" variant="ghost" icon="image-outline" title="استيراد رمز QR من المعرض" loading={importing} onPress={importQr} />
        </Card>
        <Card style={{ gap: spacing.md }}>
          <T v="h2">تجربة مجانية 14 يوماً</T>
          <T v="caption">أنشئ مؤسستك الآن وابدأ باستخدام النظام كمالك (حتى 3 موظفين).</T>
          <Field testID="trial-org-name-input" label="اسم المؤسسة" value={org} onChangeText={setOrg} placeholder="مثال: شركة النور للتوزيع" />
          <Btn testID="start-trial-button" variant="secondary" title="ابدأ التجربة" icon="rocket-outline" onPress={() => run("trial")} loading={loading === "trial"} />
        </Card>
      </KeyboardAwareScrollView>
      <Modal visible={scan} animationType="slide" onRequestClose={() => setScan(false)}>
        <QrScan
          onClose={() => setScan(false)}
          onCode={(c) => { setScan(false); const v = c.trim().toUpperCase(); setCode(v); run("code", v); }}
        />
      </Modal>
    </View>
  );
}

// Full-screen QR scanner so a new employee can join by scanning the owner's invite code
// instead of typing it. Camera permission is requested contextually with a graceful fallback.
function QrScan({ onCode, onClose }: { onCode: (c: string) => void; onClose: () => void }) {
  const [perm, requestPerm] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [locked, setLocked] = useState(false);

  if (!perm) {
    return <View testID="qr-scan-screen" style={{ flex: 1, backgroundColor: colors.surface }} />;
  }
  if (!perm.granted) {
    return (
      <View testID="qr-scan-screen" style={{ flex: 1, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.md, justifyContent: "center", paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }}>
        <T v="h2" style={{ textAlign: "center" }}>مسح رمز الموظف</T>
        <T v="caption" style={{ textAlign: "center" }}>نحتاج إذن الكاميرا لمسح رمز QR الذي أرسله لك المدير.</T>
        {perm.canAskAgain ? (
          <Btn testID="grant-camera-button" title="السماح باستخدام الكاميرا" icon="camera-outline" onPress={requestPerm} />
        ) : (
          <Btn testID="open-settings-button" title="فتح إعدادات التطبيق" icon="settings-outline" onPress={() => Linking.openSettings()} />
        )}
        <Btn testID="scan-cancel-button" variant="ghost" title="إلغاء" onPress={onClose} />
      </View>
    );
  }
  return (
    <View testID="qr-scan-screen" style={{ flex: 1, backgroundColor: "#000000" }}>
      <CameraView
        testID="qr-camera"
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => { if (locked) return; setLocked(true); onCode(data); }}
      />
      <View style={{ position: "absolute", top: insets.top + spacing.lg, left: spacing.lg, right: spacing.lg }}>
        <T color="onSurfaceInverse" style={{ textAlign: "center" }}>وجّه الكاميرا نحو رمز QR الخاص بالموظف</T>
      </View>
      <View style={{ position: "absolute", bottom: insets.bottom + spacing.lg, left: spacing.lg, right: spacing.lg }}>
        <Btn testID="scan-cancel-button" variant="secondary" title="إلغاء" onPress={onClose} />
      </View>
    </View>
  );
}
