import { RoleTabs } from "@/src/RoleTabs";

export default function DistributorLayout() {
  return (
    <RoleTabs
      tourKey="dist"
      tabs={[
        { name: "index", title: "الرئيسية", icon: "home-outline", sf: "house.fill", desc: "ملخص مبيعاتك وتحصيلاتك ومخزونك اليومي." },
        { name: "sale", title: "بيع", icon: "cart-outline", sf: "cart.fill", desc: "أنشئ فاتورة بيع نقدية أو آجلة مع الخصومات وطباعة الإيصال." },
        { name: "customers", title: "العملاء", icon: "people-outline", sf: "person.2.fill", desc: "عملاؤك، كشوف الحساب، التحصيلات وتذكير الديون عبر واتساب." },
        { name: "ops", title: "العمليات", icon: "swap-horizontal-outline", sf: "arrow.left.arrow.right", desc: "المخزون، الاستلامات، المرتجعات، سندات الصرف وخط السير اليومي." },
      ]}
    />
  );
}
