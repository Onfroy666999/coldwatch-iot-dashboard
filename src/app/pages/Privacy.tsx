import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { ChevronLeft } from 'lucide-react';

export default function Privacy() {
  const { setActivePage } = useApp();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22 }}
      className="w-full h-full overflow-y-auto"
    >
      <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-8">
        {/* Header with back button */}
        <div className="mb-8 flex items-center gap-3">
          <button
            onClick={() => setActivePage('settings')}
            className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 transition-all flex-shrink-0 hover:bg-[#F3F4F6]"
            style={{ background: '#F3F4F6', border: '1px solid #E4E7EC' }}
            aria-label="Back to settings"
          >
            <ChevronLeft className="w-5 h-5 text-[#111827]" />
          </button>
          <h1 className="text-2xl md:text-3xl font-semibold text-[#111827]">Privacy Policy</h1>
        </div>

        {/* Content */}
        <div className="space-y-8 text-[#374151]">
          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">1. Introduction</h2>
            <p className="leading-relaxed">
              ColdWatch ("we," "us," "our") monitors cold-storage conditions using ESP32-based IoT sensors that report
              temperature and humidity readings to this app, and can take automated cooling actions on your behalf.
              This Privacy Policy explains what we collect, how it's used, and the specific third parties involved in
              running the service.
            </p>
            <p className="leading-relaxed mt-3">
              Please read this carefully. If you do not agree with these practices, please do not use ColdWatch.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">2. Information We Collect</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-[#111827] mb-2">Account information</h3>
                <p className="leading-relaxed">Provided directly by you:</p>
                <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                  <li>Name, email address, and phone number</li>
                  <li>Account password (stored hashed, never in plain text)</li>
                  <li>An optional emergency escalation contact for unresolved alerts</li>
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-[#111827] mb-2">Device and sensor data</h3>
                <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                  <li>Temperature and humidity readings sent by your registered devices over MQTT</li>
                  <li>Device ID, connection status (online/offline), and last-seen timestamps</li>
                  <li>What produce or crops you've assigned to a device, and the facility/transport details you enter when setting it up</li>
                  <li>Alerts raised against a device, and any autonomous cooling actions ColdWatch has taken (see Section 4)</li>
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-[#111827] mb-2">Produce condition photos</h3>
                <p className="leading-relaxed">
                  If you photograph produce for AI condition assessment, the image is sent to our AI vision provider
                  (Groq) for one-time analysis and is <strong>not stored</strong> on our servers afterward — only the
                  resulting text assessment (e.g. "fresh," "in-between") is saved against your device.
                </p>
              </div>

              <div>
                <h3 className="font-medium text-[#111827] mb-2">Push notification token</h3>
                <p className="leading-relaxed">
                  If you enable push alerts, we store a device push token (via Firebase Cloud Messaging) used solely
                  to deliver alert notifications to your phone. You can remove it at any time by disabling
                  notifications in Settings.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Displaying live readings, trends, and device status on your dashboard</li>
              <li>Raising alerts when a device's temperature or humidity breaches your thresholds</li>
              <li>Assessing produce condition from photos you submit, using AI</li>
              <li>Deciding whether an unresolved alert qualifies for autonomous cooling action (Section 4)</li>
              <li>Account authentication, password resets, and account recovery</li>
            </ul>
            <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: '#F0F9FF', border: '1px solid #BAE6FD' }}>
              <p className="text-sm font-semibold text-[#0369A1] mb-2">Email, phone, and push — used for alerts and OTPs only</p>
              <p className="text-sm leading-relaxed text-[#0C4A6E]">
                Your <strong>email address</strong> is used only to send threshold-breach alert notifications and
                one-time passwords (OTPs) for verification and password resets, delivered via our email provider, Resend.
              </p>
              <p className="text-sm leading-relaxed text-[#0C4A6E] mt-2">
                Your <strong>phone number</strong> is used only for SMS threshold-breach alerts and OTP delivery,
                sent via our SMS provider, Arkesel.
              </p>
              <p className="text-sm leading-relaxed text-[#0C4A6E] mt-2">
                We do <strong>not</strong> send marketing email or promotional SMS, and we do <strong>not</strong> sell
                or share your contact details. You can remove your email or phone number at any time in Settings —
                doing so disables the corresponding alert channel.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">4. Autonomous Cooling Actions</h2>
            <p className="leading-relaxed">
              If an alert on your device goes unresolved for an extended period (configurable per device, in
              Settings), ColdWatch may automatically send a cooling command to your device's Peltier module to try
              to correct the condition, then mark the alert resolved and notify you of what it did and why. This is
              an unattended, physical action taken on your equipment — you can adjust or disable the auto-resolve
              window per device at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">5. Who We Share Data With</h2>
            <p className="leading-relaxed">
              We do not sell, trade, or rent your personal information. Data passes through the following
              subprocessors strictly to operate the service:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li><strong>Railway</strong> — hosts our application server and PostgreSQL database</li>
              <li><strong>HiveMQ</strong> — the MQTT broker your devices connect through to send readings and receive commands</li>
              <li><strong>Groq</strong> — processes produce condition photos for AI assessment (photo itself is not retained by us)</li>
              <li><strong>Resend</strong> — delivers transactional email (alerts, OTPs)</li>
              <li><strong>Arkesel</strong> — delivers SMS (alerts, OTPs)</li>
              <li><strong>Firebase Cloud Messaging</strong> — delivers push notifications</li>
            </ul>
            <p className="leading-relaxed mt-3">
              We may also disclose information if required by law, or in connection with a merger, acquisition, or
              sale of assets.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">6. Data Retention</h2>
            <p className="leading-relaxed">
              Sensor readings are kept according to the retention period you choose in Settings — 7, 14, 30, 90, or
              365 days (30 days by default). Readings older than your chosen window are automatically and
              permanently deleted by a scheduled job. Account information, device configuration, and alert history
              are kept for as long as your account is active.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">7. Your Privacy Rights</h2>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Access or correct your account information directly in Settings</li>
              <li>Change your data retention window at any time</li>
              <li>Delete your account and all associated data permanently, from Settings — this is immediate and irreversible</li>
              <li>Remove your email, phone, or push token to stop a specific alert channel without deleting your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">8. Data Security</h2>
            <p className="leading-relaxed">
              We use industry-standard measures — hashed passwords, encrypted connections, and access controls — to
              protect your information. No method of electronic transmission or storage is 100% secure, and we
              cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">9. Children's Privacy</h2>
            <p className="leading-relaxed">
              ColdWatch is not intended for individuals under 13. We do not knowingly collect personal information
              from children under 13, and will delete it promptly if we become aware of such collection.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">10. Changes to This Privacy Policy</h2>
            <p className="leading-relaxed">
              We may update this Privacy Policy from time to time. Changes will be posted here with an updated
              "Last Updated" date. Continued use of ColdWatch after changes take effect constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">11. Contact Us</h2>
            <p className="leading-relaxed">Questions about this Privacy Policy or our data practices:</p>
            <div className="mt-3 p-4 rounded-xl bg-[#F9FAFB] border border-[#E4E7EC]">
              <p className="text-sm font-medium text-[#111827]">ColdWatch Privacy Team</p>
              <p className="text-sm text-[#6B7280] mt-1">Email: privacy@coldwatch.app</p>
            </div>
          </section>

          <div className="text-xs text-[#9CA3AF] pt-4 border-t border-[#E4E7EC]">
            <p>Last Updated: July 2026</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
