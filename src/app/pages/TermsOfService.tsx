import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { ChevronLeft } from 'lucide-react';

export default function TermsOfService() {
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
          <h1 className="text-2xl md:text-3xl font-semibold text-[#111827]">Terms of Service</h1>
        </div>

        {/* Content */}
        <div className="space-y-8 text-[#374151]">
          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">1. Acceptance of Terms</h2>
            <p className="leading-relaxed">
              By creating an account or using ColdWatch — an IoT cold-storage monitoring app that connects to
              physical ESP32-based sensor devices and, in some cases, controls a Peltier cooling module on your
              behalf — you agree to be bound by these Terms. If you do not agree, please do not use ColdWatch.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">2. What ColdWatch Does</h2>
            <p className="leading-relaxed">ColdWatch lets you:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Register physical devices (identified by a Device ID printed on the hardware) and view live temperature/humidity readings</li>
              <li>Assign crops or produce to a device and receive storage guidance, compatibility warnings, and shelf-life estimates</li>
              <li>Photograph produce for an AI-generated condition assessment</li>
              <li>Receive alerts by email, SMS, and push notification when a device breaches its configured thresholds</li>
              <li>Optionally allow ColdWatch to take autonomous cooling action on a device if an alert goes unresolved past a time window you set (see Section 5)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">3. User Accounts</h2>
            <p className="leading-relaxed">
              You're responsible for keeping your account credentials confidential and for all activity under your
              account. Notify us immediately of any unauthorized use. You may delete your account at any time from
              Settings — this permanently removes your account, devices, readings, and alert history.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">4. Sensor Data and AI Assessments</h2>
            <p className="leading-relaxed">
              Temperature, humidity, and other sensor data displayed in ColdWatch comes from your physical devices
              and is provided for informational purposes. Sensor readings may have error margins, connectivity gaps,
              or delays, and produce condition photos are assessed by a third-party AI model whose output is a
              best-effort estimate, not a guarantee. ColdWatch is not responsible for spoilage, loss, or any decision
              made based on this data or an AI assessment — you remain responsible for monitoring your stored goods.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">5. Autonomous Cooling Actions</h2>
            <div className="p-4 rounded-xl mb-3" style={{ backgroundColor: '#FFF8F0', border: '1px solid #F5CBA7' }}>
              <p className="text-sm font-semibold text-[#C0501A] mb-2">This feature controls physical equipment without your direct input</p>
              <p className="text-sm leading-relaxed text-[#7A3010]">
                If a device has an unresolved alert past its configured auto-resolve window, ColdWatch may
                automatically send an ON/OFF command to that device's Peltier module, then mark the alert resolved
                and notify you of the action taken. You can change or disable this window per device in Settings.
                By leaving this enabled, you accept that ColdWatch may act on your hardware without you actively
                approving that specific action, and that ColdWatch is not liable for outcomes resulting from an
                autonomous action taken in good faith based on the sensor data available at the time.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">6. Use of Email, Phone, and Push Notifications</h2>
            <p className="leading-relaxed">
              By providing your email, phone number, or enabling push notifications, you agree these are used only
              for: threshold-breach alerts, autonomous-action notices, and one-time passwords (OTPs) for
              verification and password resets. ColdWatch does not send marketing email or promotional SMS, and does
              not sell or share your contact details for advertising. Remove any of these at any time in Settings to
              disable that channel.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">7. Acceptable Use</h2>
            <p className="leading-relaxed">You agree not to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Use ColdWatch for any unlawful purpose or in violation of applicable regulations</li>
              <li>Attempt to reverse engineer, decompile, or interfere with the app or its backend services</li>
              <li>Register a device you do not own or are not authorized to monitor/control</li>
              <li>Use the AI photo assessment feature to submit content unrelated to produce condition</li>
              <li>Interfere with other users' devices, data, or access to the service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">8. Disclaimer of Warranties</h2>
            <p className="leading-relaxed">
              ColdWatch is provided "as is." We make no warranty that the service, sensor readings, AI assessments,
              or autonomous actions will be uninterrupted, error-free, or fit for a particular purpose, including
              implied warranties of merchantability or non-infringement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">9. Limitation of Liability</h2>
            <p className="leading-relaxed">
              To the fullest extent permitted by law, ColdWatch and its affiliates are not liable for any damages —
              including spoiled goods, lost inventory, or business interruption — arising from use of the service,
              inaccurate sensor data, a missed or delayed alert, or an autonomous cooling action, even if we've been
              advised of the possibility of such damage.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">10. Modifications to Terms</h2>
            <p className="leading-relaxed">
              We may revise these Terms at any time. Continued use of ColdWatch after a change takes effect
              constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">11. Governing Law</h2>
            <p className="leading-relaxed">
              These Terms are governed by the laws of the Republic of Ghana, and you submit to the exclusive
              jurisdiction of its courts for any dispute arising from your use of ColdWatch.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">12. Indemnification</h2>
            <p className="leading-relaxed">
              You agree to indemnify and hold harmless ColdWatch and its affiliates from claims, damages, or
              expenses (including reasonable legal fees) arising from your use of the service or breach of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">13. Termination</h2>
            <p className="leading-relaxed">
              We may suspend or terminate your account for breach of these Terms. You may delete your account at any
              time from Settings, which immediately and permanently removes your data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">14. Entire Agreement</h2>
            <p className="leading-relaxed">
              These Terms and our Privacy Policy make up the entire agreement between you and ColdWatch regarding
              your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">15. Contact Information</h2>
            <p className="leading-relaxed">Questions about these Terms:</p>
            <div className="mt-3 p-4 rounded-xl bg-[#F9FAFB] border border-[#E4E7EC]">
              <p className="text-sm font-medium text-[#111827]">ColdWatch Legal Team</p>
              <p className="text-sm text-[#6B7280] mt-1">Email: legal@coldwatch.app</p>
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
