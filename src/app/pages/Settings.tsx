import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AlertTriangle, Bell, User, Save, Shield, Thermometer } from 'lucide-react';

export default function Settings() {
  const { settings, updateSettings, user, addToast } = useApp();
  const [localSettings, setLocalSettings] = useState(settings);
  const [userName, setUserName] = useState(user.name);
  const [userEmail, setUserEmail] = useState(user.email);

  const handleSaveThresholds = () => {
    updateSettings(localSettings);
    addToast({ id: `toast-${Date.now()}`, type: 'success', message: 'Alert thresholds updated successfully' });
  };

  const handleSaveNotifications = () => {
    updateSettings(localSettings);
    addToast({ id: `toast-${Date.now()}`, type: 'success', message: 'Notification preferences saved' });
  };

  const handleUpdateAccount = () => {
    addToast({ id: `toast-${Date.now()}`, type: 'success', message: 'Account settings updated' });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Alert Thresholds */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(230,126,34,0.1)' }}>
            <Thermometer className="w-5 h-5" style={{ color: '#E67E22' }} />
          </div>
          <div>
            <h3 className="text-gray-800">Alert Thresholds</h3>
            <p className="text-sm text-gray-500">Set temperature and humidity limits for alerts</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          <div>
            <label className="block text-sm text-gray-700 mb-1.5">Warning Temperature (°C)</label>
            <input
              type="number"
              value={localSettings.warningTemperature}
              onChange={e => setLocalSettings({ ...localSettings, warningTemperature: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-[#E67E22] outline-none transition-all text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Alert when temperature exceeds this value</p>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1.5">Critical Temperature (°C)</label>
            <input
              type="number"
              value={localSettings.criticalTemperature}
              onChange={e => setLocalSettings({ ...localSettings, criticalTemperature: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-[#C0392B] outline-none transition-all text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Critical alert for urgent attention</p>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1.5">Warning Humidity (%)</label>
            <input
              type="number"
              value={localSettings.warningHumidity}
              onChange={e => setLocalSettings({ ...localSettings, warningHumidity: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-[#E67E22] outline-none transition-all text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1.5">Critical Humidity (%)</label>
            <input
              type="number"
              value={localSettings.criticalHumidity}
              onChange={e => setLocalSettings({ ...localSettings, criticalHumidity: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-[#C0392B] outline-none transition-all text-sm"
            />
          </div>
        </div>

        <button
          onClick={handleSaveThresholds}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm hover:opacity-90 transition-all"
          style={{ backgroundColor: '#2979C8' }}
        >
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </div>

      {/* Notification Preferences */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(41,121,200,0.1)' }}>
            <Bell className="w-5 h-5" style={{ color: '#2979C8' }} />
          </div>
          <div>
            <h3 className="text-gray-800">Notification Preferences</h3>
            <p className="text-sm text-gray-500">Choose how you want to receive alerts</p>
          </div>
        </div>

        <div className="space-y-5 mb-6">
          {/* In-App Notifications */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700">In-App Notifications</p>
              <p className="text-xs text-gray-400">Show notifications within the dashboard</p>
            </div>
            <button
              onClick={() => setLocalSettings({ ...localSettings, inAppNotifications: !localSettings.inAppNotifications })}
              className={`w-11 h-6 rounded-full transition-colors relative ${localSettings.inAppNotifications ? 'bg-[#2979C8]' : 'bg-gray-300'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-0.5 transition-transform ${localSettings.inAppNotifications ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Email Alerts */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700">Email Alerts</p>
              <p className="text-xs text-gray-400">Receive alerts via email</p>
            </div>
            <button
              onClick={() => setLocalSettings({ ...localSettings, emailAlerts: !localSettings.emailAlerts })}
              className={`w-11 h-6 rounded-full transition-colors relative ${localSettings.emailAlerts ? 'bg-[#2979C8]' : 'bg-gray-300'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-0.5 transition-transform ${localSettings.emailAlerts ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* SMS Alerts */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700">SMS Alerts</p>
                <p className="text-xs text-gray-400">Receive alerts via SMS (standard rates apply)</p>
              </div>
              <button
                onClick={() => setLocalSettings({ ...localSettings, smsAlerts: !localSettings.smsAlerts })}
                className={`w-11 h-6 rounded-full transition-colors relative ${localSettings.smsAlerts ? 'bg-[#2979C8]' : 'bg-gray-300'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-0.5 transition-transform ${localSettings.smsAlerts ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {localSettings.smsAlerts && (
              <input
                placeholder="Phone number"
                value={localSettings.userPhone}
                onChange={e => setLocalSettings({ ...localSettings, userPhone: e.target.value })}
                className="mt-3 w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-[#2979C8] outline-none transition-all text-sm"
              />
            )}
          </div>

          {/* Alert Repeat Interval */}
          <div>
            <p className="text-sm text-gray-700 mb-1">Alert Repeat Interval</p>
            <p className="text-xs text-gray-400 mb-2">How often to repeat alerts if unacknowledged</p>
            <select
              value={localSettings.alertRepeatInterval}
              onChange={e => setLocalSettings({ ...localSettings, alertRepeatInterval: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-[#2979C8] outline-none transition-all text-sm"
            >
              <option value="5min">Every 5 minutes</option>
              <option value="15min">Every 15 minutes</option>
              <option value="30min">Every 30 minutes</option>
              <option value="once">Once only</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleSaveNotifications}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm hover:opacity-90 transition-all"
          style={{ backgroundColor: '#2979C8' }}
        >
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </div>

      {/* Account Settings */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(39,174,96,0.1)' }}>
            <User className="w-5 h-5" style={{ color: '#27AE60' }} />
          </div>
          <div>
            <h3 className="text-gray-800">Account Settings</h3>
            <p className="text-sm text-gray-500">Manage your account information</p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl" style={{ backgroundColor: '#2979C8' }}>
              {user.avatar}
            </div>
            <button className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              Upload Photo
            </button>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1.5">Full Name</label>
            <input
              value={userName}
              onChange={e => setUserName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-[#2979C8] outline-none transition-all text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={userEmail}
              onChange={e => setUserEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-[#2979C8] outline-none transition-all text-sm"
            />
          </div>

          <div className="pt-4 border-t border-gray-100">
            <h4 className="text-sm text-gray-800 mb-3">Change Password</h4>
            <div className="space-y-3">
              <input
                type="password"
                placeholder="Current password"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-[#2979C8] outline-none transition-all text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="password"
                  placeholder="New password"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-[#2979C8] outline-none transition-all text-sm"
                />
                <input
                  type="password"
                  placeholder="Confirm password"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-[#2979C8] outline-none transition-all text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleUpdateAccount}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm hover:opacity-90 transition-all"
          style={{ backgroundColor: '#2979C8' }}
        >
          <Save className="w-4 h-4" />
          Update Account
        </button>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-red-100">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-red-500" />
          <h3 className="text-red-600">Danger Zone</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <button className="px-4 py-2.5 border-2 border-red-200 rounded-xl text-red-600 text-sm hover:bg-red-50 transition-colors">
          Delete Account
        </button>
      </div>
    </div>
  );
}
