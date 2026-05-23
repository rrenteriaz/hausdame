import { requireHostUser } from "@/lib/auth/requireUser";
import NotificationsPageContent from "@/components/notifications/NotificationsPageContent";

export default async function HostNotificationsPage() {
  await requireHostUser();
  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-20">
      <h1 className="text-lg font-semibold text-neutral-900 mb-4">Notificaciones</h1>
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <NotificationsPageContent />
      </div>
    </div>
  );
}
