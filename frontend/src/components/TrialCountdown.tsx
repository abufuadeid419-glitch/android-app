import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/src/auth";
import { spacing, useTheme } from "@/src/theme";
import { Btn, Card, Ionicons, T } from "@/src/ui";

const TRIAL_WARN_DAYS = 5;
const LICENSE_WARN_DAYS = 7;

// Owner-only countdown banner in the final days of a trial (or a paid plan about to lapse).
export function TrialCountdown() {
  const { user } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const org = user?.org;
  if (user?.role !== "OWNER" || !org?.expires_at) return null;
  const ms = Date.parse(org.expires_at) - now;
  const trial = org.plan === "TRIAL";
  if (ms <= 0 || ms > (trial ? TRIAL_WARN_DAYS : LICENSE_WARN_DAYS) * 86400000) return null;

  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const urgent = days < 2;
  const tone = urgent ? colors.error : colors.warning;
  const title = trial ? "تنتهي الفترة التجريبية قريباً" : "ينتهي اشتراكك قريباً";

  return (
    <Card testID="trial-countdown-banner" style={{ gap: spacing.md, borderColor: tone, borderWidth: 1.5 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Ionicons name="hourglass-outline" size={22} color={tone} />
        <T v="label" style={{ flex: 1 }}>{title}</T>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        {[{ n: days, l: "يوم" }, { n: hours, l: "ساعة" }].map((x) => (
          <View key={x.l} testID={`trial-countdown-${x.l === "يوم" ? "days" : "hours"}`} style={{ flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: 12, backgroundColor: colors.surfaceSecondary }}>
            <T v="h1" style={{ color: tone }}>{x.n}</T>
            <T v="caption">{x.l}</T>
          </View>
        ))}
      </View>
      <T v="caption">{trial ? "رقِّ إلى Pro للحفاظ على بياناتك وإضافة المزيد من الموزعين. الاشتراك السنوي يمنحك شهرين مجاناً." : "جدّد اشتراكك لتجنب إيقاف الحسابات. وفّر أكثر بالاشتراك السنوي."}</T>
      <Btn testID="trial-countdown-upgrade-button" title={trial ? "الترقية الآن" : "تجديد الاشتراك"} icon="rocket-outline" onPress={() => router.push("/upgrade")} />
    </Card>
  );
}
