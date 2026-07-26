/**
 * Custom hook for API integration with AppContext
 * Syncs local state with backend API calls
 */

import { useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { devicesApi, alertsApi } from './api';
import { enqueueAction } from './ActionQueue';

/**
 * useDevicesSync - Syncs local devices with backend API
 * Call this once in your app to enable device API persistence
 */
export function useDevicesSync() {
  const { isAuthenticated, addDevice, updateDevice, deleteDevice } = useApp();
  const syncInProgress = useRef(false);

  // Fetch devices from backend when user logs in
  useEffect(() => {
    if (!isAuthenticated || syncInProgress.current) return;

    async function fetchDevices() {
      try {
        syncInProgress.current = true;
        const response = await devicesApi.list();
        
        if (response.devices && Array.isArray(response.devices)) {
          // Map backend device format to frontend format
          for (const backendDevice of response.devices) {
            const frontendDevice = {
              id: backendDevice.id,
              name: backendDevice.name,
              location: backendDevice.location,
              type: backendDevice.type || 'fridge',
              status: (backendDevice.status || 'offline') as 'online' | 'offline',
              lastSeen: backendDevice.lastSeenAt ? new Date(backendDevice.lastSeenAt) : new Date(),
              firmwareVersion: '2.1.3', // TODO: from backend
              batteryLevel: 100, // TODO: from backend
              tempOffset: backendDevice.tempOffset || 0,
              humidOffset: backendDevice.humidOffset || 0,
              useCustomThresholds: backendDevice.useCustomThresholds || false,
              warningTemperature: backendDevice.warningTemperature || 10,
              criticalTemperature: backendDevice.criticalTemperature || 15,
              warningHumidity: backendDevice.warningHumidity || 80,
              criticalHumidity: backendDevice.criticalHumidity || 90,
              humidAlertHigh: backendDevice.humidAlertHigh !== false,
              produceMode: backendDevice.produceMode as any,
              produceState: backendDevice.produceState as any,
              facilitySize: backendDevice.facilitySize as any,
              transportHours: backendDevice.transportHours,
              produceSetupComplete: backendDevice.produceSetupComplete || false,
            };
            
            // Check if device already exists locally (by ID)
            // If it does, update it; if not, add it
            // Note: This is simplified - a real implementation would do proper merging
            addDevice(frontendDevice.name, frontendDevice.location);
          }
          
          console.log('[DevicesSync] Synced', response.devices.length, 'devices from backend');
        }
      } catch (error) {
        // Silently fail and fall back to localStorage
        console.warn('[DevicesSync] Failed to fetch devices:', error);
      } finally {
        syncInProgress.current = false;
      }
    }

    fetchDevices();
  }, [isAuthenticated]);

  /**
   * Wrapper for addDevice that also calls API
   */
  const addDeviceWithSync = useCallback(
    async (name: string, location: string) => {
      try {
        // Call backend API to create device
        const response = await devicesApi.create({
          name,
          location,
          type: 'fridge', // default type
        });

        console.log('[DevicesSync] Device created on backend:', response.device.id);
        // Note: We don't call addDevice() here because the user may not be
        // fully authenticated yet (e.g., on signup flow). Instead, we queue
        // the action for sync and let the local state be the source of truth
        // until backend sync succeeds.
      } catch (error) {
        // Queue for offline sync
        enqueueAction({
          type: 'ADD_DEVICE',
          payload: { name, location },
        });
        console.warn('[DevicesSync] Failed to create device on backend, queued for sync:', error);
      }
    },
    []
  );

  /**
   * Wrapper for updateDevice that also calls API
   */
  const updateDeviceWithSync = useCallback(
    async (id: string, patch: Record<string, any>) => {
      try {
        // Call backend API to update device
        const response = await devicesApi.update(id, patch);
        console.log('[DevicesSync] Device updated on backend:', response.device.id);
      } catch (error) {
        // Queue for offline sync
        enqueueAction({
          type: 'UPDATE_DEVICE',
          payload: { id, patch },
        });
        console.warn('[DevicesSync] Failed to update device on backend, queued for sync:', error);
      }
    },
    []
  );

  /**
   * Wrapper for deleteDevice that also calls API
   */
  const deleteDeviceWithSync = useCallback(
    async (id: string) => {
      try {
        // Call backend API to delete device
        await devicesApi.delete(id);
        console.log('[DevicesSync] Device deleted on backend:', id);
      } catch (error) {
        // Queue for offline sync
        enqueueAction({
          type: 'DELETE_DEVICE',
          payload: { id },
        });
        console.warn('[DevicesSync] Failed to delete device on backend, queued for sync:', error);
      }
    },
    []
  );

  return { addDeviceWithSync, updateDeviceWithSync, deleteDeviceWithSync };
}

/**
 * useAlertsSync - Fetches and syncs alerts from backend
 * Call this in components that need alert data
 */
export function useAlertsSync() {
  const { isAuthenticated, alerts } = useApp();

  /**
   * Fetch alerts from backend
   */
  const fetchAlerts = useCallback(
    async (query?: any) => {
      try {
        const response = await alertsApi.list(query);
        console.log('[AlertsSync] Fetched', response.alerts.length, 'alerts');
        return response;
      } catch (error) {
        console.warn('[AlertsSync] Failed to fetch alerts:', error);
        return { alerts: [], pagination: {} };
      }
    },
    []
  );

  /**
   * Acknowledge an alert
   */
  const acknowledgeAlert = useCallback(
    async (id: string) => {
      try {
        const response = await alertsApi.acknowledge(id);
        console.log('[AlertsSync] Alert acknowledged:', id);
        return response.alert;
      } catch (error) {
        // Queue for offline sync
        enqueueAction({
          type: 'ACKNOWLEDGE_ALERT',
          payload: { id },
        });
        console.warn('[AlertsSync] Failed to acknowledge alert, queued for sync:', error);
      }
    },
    []
  );

  /**
   * Resolve an alert
   */
  const resolveAlert = useCallback(
    async (id: string) => {
      try {
        const response = await alertsApi.resolve(id);
        console.log('[AlertsSync] Alert resolved:', id);
        return response.alert;
      } catch (error) {
        // Queue for offline sync
        enqueueAction({
          type: 'RESOLVE_ALERT',
          payload: { id },
        });
        console.warn('[AlertsSync] Failed to resolve alert, queued for sync:', error);
      }
    },
    []
  );

  /**
   * Delete an alert
   */
  const deleteAlert = useCallback(
    async (id: string) => {
      try {
        await alertsApi.delete(id);
        console.log('[AlertsSync] Alert deleted:', id);
      } catch (error) {
        console.warn('[AlertsSync] Failed to delete alert:', error);
      }
    },
    []
  );

  return {
    fetchAlerts,
    acknowledgeAlert,
    resolveAlert,
    deleteAlert,
  };
}
