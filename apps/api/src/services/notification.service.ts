import { EntityManager } from "@mikro-orm/postgresql";
import { Notification, User, WatchedLocation } from "@cekdulu/db";
import { NotifType } from "@cekdulu/shared";
import { emitUserNotification } from "../lib/socket";
import { dispatchWhatsAppMessage } from "../lib/whatsapp";

export interface CreateNotificationInput {
  user: User;
  type: NotifType;
  title: string;
  body: string;
  referenceId?: string | null;
  sendWhatsApp?: boolean;
}

export async function createAndDispatchNotification(
  em: EntityManager,
  input: CreateNotificationInput,
): Promise<Notification> {
  const notif = em.create(Notification, {
    user: input.user,
    type: input.type,
    title: input.title,
    body: input.body,
    referenceId: input.referenceId ?? null,
    isRead: false,
    sentViaWa: false,
  });

  if (input.sendWhatsApp && input.user.waNotifEnabled) {
    const delivered = await dispatchWhatsAppMessage({
      toPhoneNumber: input.user.phoneNumber,
      text: `*${input.title}*\n${input.body}`,
      category: "notification",
    });
    notif.sentViaWa = delivered;
  }

  emitUserNotification(input.user.id, {
    id: notif.id,
    type: notif.type,
    title: notif.title,
    body: notif.body,
    referenceId: notif.referenceId,
    isRead: notif.isRead,
    createdAt: notif.createdAt,
  });

  return notif;
}

export async function notifyLocationWatchers(
  em: EntityManager,
  params: {
    locationId: string;
    excludeUserId?: string;
    type: NotifType;
    title: string;
    body: string;
    referenceId?: string | null;
  },
): Promise<void> {
  const watchers = await em.find(
    WatchedLocation,
    { location: params.locationId },
    { populate: ["user"] },
  );

  for (const watch of watchers) {
    if (params.excludeUserId && watch.user.id === params.excludeUserId) {
      continue;
    }
    await createAndDispatchNotification(em, {
      user: watch.user,
      type: params.type,
      title: params.title,
      body: params.body,
      referenceId: params.referenceId,
      sendWhatsApp: true,
    });
  }
}
