import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  ValidateBy,
  ValidateNested,
} from 'class-validator';

export const DASHBOARD_KPI_IDS = [
  'roi',
  'units',
  'bets',
  'pending',
  'totalStaked',
  'averageStake',
  'averageOdd',
  'hitRate',
] as const;
export const DASHBOARD_ICON_IDS = [
  'trending-up',
  'coins',
  'database',
  'clock',
  'credit-card',
  'chart-bar',
  'target',
  'chart-line',
  'percent',
  'activity',
  'layers',
  'list',
  'ticket',
  'timer',
  'hourglass',
  'wallet',
  'banknote',
  'crosshair',
  'trophy',
  'check-circle',
] as const;

class DashboardKpiDTO {
  @IsIn(DASHBOARD_KPI_IDS)
  id!: (typeof DASHBOARD_KPI_IDS)[number];

  @IsBoolean()
  visible!: boolean;

  @IsIn(DASHBOARD_ICON_IDS)
  icon!: (typeof DASHBOARD_ICON_IDS)[number];
}

class PerformanceColorsDTO {
  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  customEnabled!: boolean;

  @IsIn(['default-positive', 'emerald', 'turquoise', 'blue'])
  positive!: 'default-positive' | 'emerald' | 'turquoise' | 'blue';

  @IsIn(['default-negative', 'coral', 'orange', 'pink'])
  negative!: 'default-negative' | 'coral' | 'orange' | 'pink';
}

export class DashboardPreferencesDTO {
  @IsArray()
  @ArrayMinSize(8)
  @ArrayMaxSize(8)
  @ArrayUnique((kpi: DashboardKpiDTO) => kpi?.id)
  @ValidateBy({
    name: 'minimumVisibleKpis',
    validator: {
      validate: (value: unknown) =>
        Array.isArray(value) &&
        value.filter((kpi: DashboardKpiDTO | null) => kpi?.visible === true)
          .length >= 2,
      defaultMessage: () => 'Selecione pelo menos 2 indicadores.',
    },
  })
  @ValidateNested({ each: true })
  @Type(() => DashboardKpiDTO)
  kpis!: DashboardKpiDTO[];

  @IsObject()
  @ValidateNested()
  @Type(() => PerformanceColorsDTO)
  performanceColors!: PerformanceColorsDTO;
}
