import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  DashboardPreferencesDTO,
  DASHBOARD_KPI_IDS,
} from './dashboard-preferences.dto';
import { UpdateUserRequestDTO } from './request.dto';

function preferences() {
  return {
    kpis: DASHBOARD_KPI_IDS.map((id) => ({
      id,
      visible: true,
      icon: 'trending-up',
    })),
    performanceColors: {
      enabled: true,
      customEnabled: false,
      positive: 'default-positive',
      negative: 'default-negative',
    },
  };
}
const check = (value: unknown) =>
  validate(plainToInstance(DashboardPreferencesDTO, value), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('Dashboard preferences contract', () => {
  it.each([2, 3, 4, 5, 6, 7, 8])(
    'accepts %i visible indicators',
    async (count) => {
      const value = preferences();
      value.kpis.forEach((kpi, index) => {
        kpi.visible = index < count;
      });
      value.kpis.reverse();
      expect(await check(value)).toEqual([]);
    },
  );
  it('rejects less than two visible indicators', async () => {
    const value = preferences();
    value.kpis.forEach((kpi, index) => {
      kpi.visible = index === 0;
    });
    expect(await check(value)).not.toEqual([]);
  });
  it('rejects duplicate/missing/unknown indicators and arbitrary icons/colors', async () => {
    const value = preferences();
    value.kpis[0] = value.kpis[1];
    expect(await check(value)).not.toEqual([]);
    for (const kpis of [
      [],
      [null],
      [...preferences().kpis, preferences().kpis[0]],
      preferences().kpis.map((kpi) => ({ ...kpi, id: 'unknown' })),
      preferences().kpis.map((kpi) => ({ ...kpi, icon: '<svg />' })),
    ]) {
      expect(await check({ ...preferences(), kpis })).not.toEqual([]);
    }
    for (const performanceColors of [
      null,
      [],
      {},
      { ...value.performanceColors, positive: '#ffffff' },
      { ...value.performanceColors, enabled: 'true' },
    ]) {
      expect(await check({ ...preferences(), performanceColors })).not.toEqual(
        [],
      );
    }
  });
  it('allows resetting with null and existing updates without preferences', async () => {
    for (const input of [
      {},
      { dashboardPreferences: null },
      { dashboardPreferences: preferences() },
    ]) {
      expect(
        await validate(plainToInstance(UpdateUserRequestDTO, input)),
      ).toEqual([]);
    }
  });
});
