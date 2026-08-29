import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";
import type { TipEntity, TipId } from "./Tips";
import type { UserId } from "./Users";

export type TipDeliveryId = number & { __type: "TipDeliveryId" };

// Última cópia de DM enviada pra um (tip, usuário) — guarda o texto/entidades
// exatos que foram mandados (com a recomendação já calculada pra banca desse
// usuário) pra dar pra editar essa mensagem depois (banner de planilhado/caiu)
// sem precisar recalcular nada.
export default interface TipDeliveriesTable {
  id: ColumnType<TipDeliveryId, TipDeliveryId | undefined, never>;
  tipId: ColumnType<TipId, TipId, never>;
  userId: ColumnType<UserId, UserId, never>;
  messageId: ColumnType<number, number, number>;
  hasMedia: ColumnType<boolean, boolean, boolean>;
  text: ColumnType<string, string, string>;
  entities: ColumnType<TipEntity[] | null, string | null, string | null>;
  createdAt: ColumnType<Date, Date | undefined, never>;
}

export type TipDelivery = Selectable<TipDeliveriesTable>;
export type NewTipDelivery = Insertable<TipDeliveriesTable>;
export type UpdateTipDelivery = Updateable<TipDeliveriesTable>;
