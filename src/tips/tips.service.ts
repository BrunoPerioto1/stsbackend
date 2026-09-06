import { Injectable } from '@nestjs/common';
import { TipsRepository } from '../infra/repository/tips.repository';
import type { NewTip, TipId, TipEntity } from '../db_types/Tips';
import type { NewTipDelivery } from '../db_types/TipDeliveries';
import type { UserId } from '../db_types/Users';

interface RecordTipData {
  chatId: number;
  messageId: number;
  text: string;
  percent: number | null;
  isAviso: boolean;
  hasMedia: boolean;
  entities: TipEntity[] | null;
}

interface SaveDeliveryData {
  tipId: number;
  userId: number;
  messageId: number;
  hasMedia: boolean;
  text: string;
  entities: TipEntity[] | null;
}

@Injectable()
export class TipsService {
  constructor(private readonly tipsRepository: TipsRepository) {}

  async recordTip(data: RecordTipData) {
    const newTip: NewTip = {
      chatId: data.chatId,
      messageId: data.messageId,
      text: data.text,
      percent: data.percent,
      isAviso: data.isAviso,
      hasMedia: data.hasMedia,
      entities: data.entities ? JSON.stringify(data.entities) : null,
    };
    return this.tipsRepository.create(newTip);
  }

  async findById(tipId: number) {
    return this.tipsRepository.findById(tipId as TipId);
  }

  async getSummaryForUser(userId: number, minPercentFilter: number | null) {
    return this.tipsRepository.findSummaryForUser(
      userId as UserId,
      minPercentFilter,
    );
  }

  async dismissTip(tipId: number, userId: number) {
    return this.tipsRepository.dismiss(tipId as TipId, userId as UserId);
  }

  async undismissTip(tipId: number, userId: number) {
    return this.tipsRepository.undismiss(tipId as TipId, userId as UserId);
  }

  async saveDelivery(data: SaveDeliveryData) {
    const delivery: NewTipDelivery = {
      tipId: data.tipId as TipId,
      userId: data.userId as UserId,
      messageId: data.messageId,
      hasMedia: data.hasMedia,
      text: data.text,
      entities: data.entities ? JSON.stringify(data.entities) : null,
    };
    return this.tipsRepository.upsertDelivery(delivery);
  }

  async findDelivery(tipId: number, userId: number) {
    return this.tipsRepository.findDelivery(tipId as TipId, userId as UserId);
  }
}
