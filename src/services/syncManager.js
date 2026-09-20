// Background Synchronization Engine for BSK Clinic
// Reconciles offline Outbox items (Patients and Bookings) when network/backend is healthy.

import { offlineStorage } from './offlineStorage';

const API_BASE = process.env.REACT_APP_API_BASE || '/api/clinic';
const HEARTBEAT_INTERVAL_MS = 20000; // 20 seconds

class SyncManager {
  constructor() {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.isSyncing = false;
    this.pendingCount = 0;
    this.lastSyncTime = null;
    this.lastError = null;
    this.listeners = new Set();
    this.heartbeatTimer = null;

    this.init();
  }

  init() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notify();
      this.triggerSync();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notify();
    });

    // Start background health ping & sync monitor
    this.startHeartbeat();

    // Initial count check
    this.updatePendingCount();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    // Initial emit
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  notify() {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (err) {
        console.error('Error in sync listener:', err);
      }
    });
  }

  getState() {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount: this.pendingCount,
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastError,
    };
  }

  async updatePendingCount() {
    try {
      this.pendingCount = await offlineStorage.getPendingOutboxCount();
      this.notify();
    } catch (_) {}
  }

  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(async () => {
      // Check backend reachability
      const isReachable = await this.checkBackendHealth();
      const statusChanged = this.isOnline !== isReachable;
      this.isOnline = isReachable;

      if (statusChanged) {
        this.notify();
      }

      // If online and we have pending items, trigger sync
      if (this.isOnline && !this.isSyncing) {
        const count = await offlineStorage.getPendingOutboxCount();
        this.pendingCount = count;
        if (count > 0) {
          this.triggerSync();
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  async checkBackendHealth() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return false;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${API_BASE}/services`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res.status >= 200 && res.status < 500;
    } catch (_) {
      return false;
    }
  }

  async triggerSync() {
    if (this.isSyncing) return;

    const token = localStorage.getItem('bsk_token');
    const authHeaders = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const items = await offlineStorage.getPendingOutboxItems();
    this.pendingCount = items.length;
    if (items.length === 0) {
      this.notify();
      return;
    }

    this.isSyncing = true;
    this.lastError = null;
    this.notify();

    let syncedCount = 0;

    try {
      for (const item of items) {
        // Map any temporary patient IDs in booking payload to real DB id if patient was synced first
        if (item.type === 'BOOKING' && item.payload && String(item.payload.patientId).startsWith('temp_')) {
          // If patientId is temporary, clear it so backend creates/finds it by name+phone seamlessly
          item.payload.patientId = null;
        }

        try {
          if (item.type === 'PATIENT') {
            const res = await fetch(`${API_BASE}/patients`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify(item.payload),
            });

            if (res.ok) {
              const savedPatient = await res.json();
              await offlineStorage.addCachedPatient(savedPatient);
              await offlineStorage.removeOutboxItem(item.id);
              syncedCount++;
            } else if (res.status >= 500) {
              // Server error, stop queue and retry later
              this.lastError = `Server returned ${res.status}`;
              break;
            } else {
              // Client error (e.g. 400), don't block entire queue forever
              await offlineStorage.updateOutboxItem(item.id, {
                status: 'FAILED',
                lastError: `Failed with status ${res.status}`,
              });
            }
          } else if (item.type === 'BOOKING') {
            const res = await fetch(`${API_BASE}/bookings`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify(item.payload),
            });

            if (res.ok) {
              const savedBooking = await res.json();
              if (savedBooking.services && typeof savedBooking.services === 'string') {
                try {
                  savedBooking.services = JSON.parse(savedBooking.services);
                } catch (_) {}
              }
              await offlineStorage.replaceCachedBooking(item.tempId, savedBooking);
              await offlineStorage.removeOutboxItem(item.id);
              syncedCount++;
            } else if (res.status >= 500) {
              this.lastError = `Server returned ${res.status}`;
              break;
            } else {
              await offlineStorage.updateOutboxItem(item.id, {
                status: 'FAILED',
                lastError: `Failed with status ${res.status}`,
              });
            }
          }
        } catch (netErr) {
          console.warn('Network error during sync replay:', netErr);
          this.isOnline = false;
          break;
        }
      }

      if (syncedCount > 0) {
        this.lastSyncTime = new Date().toLocaleTimeString();
      }
    } finally {
      this.isSyncing = false;
      this.pendingCount = await offlineStorage.getPendingOutboxCount();
      this.notify();
    }
  }
}

export const syncManager = new SyncManager();
