import 'server-only';

import type {
  GeneralSettings,
  MobileSettings,
  PaymentGatewaySettings,
  PluginsSettings,
  StorageSettings,
} from '@/lib/types';
import { getDb } from '@/lib/mongodb';

async function getSettingsDocument<T>(id: string): Promise<T | null> {
  const db = await getDb();
  const document = await db.collection<Record<string, unknown> & { _id: string }>('settings').findOne({ _id: id });
  if (!document) return null;
  const { _id, ...settings } = document;
  return { id: _id, ...settings } as T;
}

export const getServerGeneralSettings = () => getSettingsDocument<GeneralSettings>('general');
export const getServerPaymentSettings = () => getSettingsDocument<PaymentGatewaySettings>('payment');
export const getServerPluginsSettings = () => getSettingsDocument<PluginsSettings>('plugins');
export const getServerStorageSettings = () => getSettingsDocument<StorageSettings>('storage');
export const getServerMobileSettings = () => getSettingsDocument<MobileSettings>('mobile');

