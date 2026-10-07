import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { convex } from "@/src/convex";
import { useSyncState } from "@/src/offline";
import { radius, spacing, useTheme } from "@/src/theme";
import { T, useToast } from "@/src/ui";

// Small live indicator: cloud (Convex) connection + offline queue state.
export function SyncBadge() {
  const { colors } = useTheme();
  const toast = useToast();
  const { pending, online, syncing } = useSyncState();
  const [cx, setCx] = useState(() => convex.connectionState().isWebSocketConnected);

  useEffect(() => convex.subscribeToConnectionState((s) => setCx(s.isWebSocketConnected)), []);

  const state = !online || !cx ? "offline" : syncing || pending.length ? "syncing" : "synced";
  const color = state === "offline" ? colors.error : state === "syncing" ? colors.warning : colors.success;
  const label = state === "offline" ? "غير متصل" : state === "syncing" ? `مزامنة${pending.length ? ` ${pending.length}` : ""}` : "متزامن";
  const info =
    state === "offline"
      ? "لا يوجد اتصال بالسحابة. ستُحفظ عملياتك وتُرسل تلقائياً عند عودة الاتصال."
      : state === "syncing"
        ? `جارٍ رفع ${pending.length} عملية إلى السحابة...`
        : "كل بياناتك محفوظة ومتزامنة مع السحابة.";

  return (
    <Pressable
      testID="sync-status-badge"
      accessibilityLabel={label}
      onPress={() => toast(info, state === "offline" ? "error" : undefined)}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, minHeight: 44, justifyContent: "center" })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.sm, height: 28, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary }}>
        <View testID={`sync-status-${state}`} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <T v="caption" style={{ fontSize: 11 }}>{label}</T>
      </View>
    </Pressable>
  );
}
