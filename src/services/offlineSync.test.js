import { offlineStorage } from './offlineStorage';
import { syncManager } from './syncManager';
import { db } from './db';

describe('Offline Mode & Outbox System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('syncManager subscription emits current state', (done) => {
    let unsubscribe;
    unsubscribe = syncManager.subscribe((state) => {
      expect(state).toHaveProperty('isOnline');
      expect(state).toHaveProperty('isSyncing');
      expect(state).toHaveProperty('pendingCount');
      if (unsubscribe) {
        unsubscribe();
        done();
      } else {
        setTimeout(() => {
          if (unsubscribe) unsubscribe();
          done();
        }, 10);
      }
    });
  });

  test('db.saveBooking falls back to offline queue on network error', async () => {
    // Mock network failure
    global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    // Spy on offlineStorage
    const addOutboxSpy = jest.spyOn(offlineStorage, 'addToOutbox').mockResolvedValue(1);
    const addCacheSpy = jest.spyOn(offlineStorage, 'addCachedBooking').mockResolvedValue();

    const bookingInput = {
      patientName: 'Offline Test Patient',
      patientPhone: '9876543210',
      patientAge: 30,
      patientGender: 'Male',
      patientAddress: 'Test Address',
      services: [{ name: 'Audiometry', price: 500 }],
      total: 500,
      subtotal: 500,
      gst: 0,
      paymentMode: 'Cash',
      referredBy: 'Self',
    };

    const result = await db.saveBooking(bookingInput);

    expect(result.isOffline).toBe(true);
    expect(result.status).toBe('Pending Sync');
    expect(result.clientRequestId).toBeDefined();
    expect(result.uid).toMatch(/^OFFLINE-/);
    expect(addOutboxSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'BOOKING',
        payload: expect.objectContaining({
          patientName: 'Offline Test Patient',
          clientRequestId: result.clientRequestId,
        }),
      })
    );

    addOutboxSpy.mockRestore();
    addCacheSpy.mockRestore();
  });

  test('db.savePatient falls back to offline queue on network error', async () => {
    global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const addOutboxSpy = jest.spyOn(offlineStorage, 'addToOutbox').mockResolvedValue(1);
    const addCacheSpy = jest.spyOn(offlineStorage, 'addCachedPatient').mockResolvedValue();

    const patientInput = {
      name: 'Offline Patient Only',
      phone: '9988776655',
      age: 45,
      gender: 'Female',
      address: 'Kolkata',
    };

    const result = await db.savePatient(patientInput);

    expect(result.isOffline).toBe(true);
    expect(result.id).toMatch(/^temp_p_/);
    expect(addOutboxSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PATIENT',
        payload: patientInput,
      })
    );

    addOutboxSpy.mockRestore();
    addCacheSpy.mockRestore();
  });

  test('syncManager.triggerSync replays queued items to backend and cleans up', async () => {
    const mockPendingItems = [
      {
        id: 101,
        type: 'BOOKING',
        tempId: 'offline_12345',
        clientRequestId: 'req_test_1',
        payload: {
          patientName: 'Synced Patient',
          clientRequestId: 'req_test_1',
          services: [{ name: 'Test', price: 400 }],
        },
      },
    ];

    const getPendingSpy = jest.spyOn(offlineStorage, 'getPendingOutboxItems').mockResolvedValue(mockPendingItems);
    const removeSpy = jest.spyOn(offlineStorage, 'removeOutboxItem').mockResolvedValue(true);
    const replaceSpy = jest.spyOn(offlineStorage, 'replaceCachedBooking').mockResolvedValue();
    jest.spyOn(offlineStorage, 'getPendingOutboxCount').mockResolvedValue(0);

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: 55,
        uid: 'BKG-2026-055',
        patientName: 'Synced Patient',
        services: '[{"name":"Test","price":400}]',
        clientRequestId: 'req_test_1',
      }),
    });

    await syncManager.triggerSync();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/bookings'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('req_test_1'),
      })
    );
    expect(replaceSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith(101);

    getPendingSpy.mockRestore();
    removeSpy.mockRestore();
    replaceSpy.mockRestore();
  });
});
