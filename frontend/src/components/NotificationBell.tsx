import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { View } from "react-native";

import { api as cxApi } from "@/convex/_generated/api";
import { fmtDate } from "@/src/api";
import { useAuth } from "@/src/auth";
import { spacing, useTheme } from "@/src/theme";
import { Empty, IconBtn, Ionicons, IconName, Sheet, T } from "@/src/ui";

const icons: Record<string, IconName> = {
  low_stock: "warning-outline",
  out_of_stock: "alert-circle-outline",
  delivery: "car-outline",
  delivery_confirmed: "checkmark-done-outline",
  delivery_rejected: "close-circle-outline",
  stock_request: "file-tray-full-outline",
  warehouse_return: "arrow-undo-outline",
  warehouse_return_accepted: "checkmark-done-outline",
  warehouse_return_rejected: "close-circle-outline",
  debt_digest: "calendar-outline",
  upgrade: "rocket-outline",
  target: "flag-outline",
};

// Real-time notification bell, read live from Convex (useQuery). The FastAPI
// backend mirrors every notification into Convex as it is created (see
// backend/convex_bridge.py → notify()), so the badge updates without polling.
export function NotificationBell() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const q = useQuery(cxApi.notifications.list, token ? { token } : "skip");
  const readAll = useMutation(cxApi.notifications.readAll);
  const unread = q?.unread ?? 0;
  const items = q?.items ?? [];

  const openSheet = () => {
    setOpen(true);
    if (unread && token) readAll({ token }).catch(() => {});
  };

  return (
    <>
      <View>
        <IconBtn testID="notifications-button" icon="notifications-outline" onPress={openSheet} />
        {unread > 0 && (
          <View testID="notifications-unread-badge" style={{ pointerEvents: "none", position: "absolute", top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
            <T v="caption" style={{ color: colors.onError, fontSize: 11, lineHeight: 16 }}>{unread > 9 ? "9+" : unread}</T>
          </View>
        )}
      </View>
      <Sheet testID="notifications-sheet" visible={open} onClose={() => setOpen(false)} title="الإشعارات">
        {!items.length ? (
          <Empty icon="notifications-off-outline" text="لا توجد إشعارات" />
        ) : (
          items.map((n: any) => (
            <View key={n.id} testID={`notification-${n.id}`} style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-start" }}>
              <Ionicons name={icons[n.type] ?? "notifications-outline"} size={22} color={n.read ? colors.muted : colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <T v="label">{n.title}</T>
                <T v="caption">{n.body}</T>
                <T v="caption">{fmtDate(n.created_at)}</T>
              </View>
            </View>
          ))
        )}
      </Sheet>
    </>
  );
}
