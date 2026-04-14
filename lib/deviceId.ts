export interface DeviceIdStorage {
  get(): string | null;
  set(id: string): void;
}

export class WebDeviceIdStorage implements DeviceIdStorage {
  get(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('device_id');
  }
  set(id: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('device_id', id);
  }
}

const defaultStorage = new WebDeviceIdStorage();

export function getDeviceId(storage: DeviceIdStorage = defaultStorage): string {
  if (typeof window === 'undefined') return '';
  let id = storage.get();
  if (!id) {
    id = crypto.randomUUID();
    storage.set(id);
  }
  return id;
}
