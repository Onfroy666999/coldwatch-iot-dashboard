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
              ColdWatch ("we," "us," "our," or "Company") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our IoT temperature and humidity monitoring dashboard application.
            </p>
            <p className="leading-relaxed mt-3">
              Please read this Privacy Policy carefully. If you do not agree with our policies and practices, please do not use our Services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">2. Information We Collect</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-[#111827] mb-2">Personal Information</h3>
                <p className="leading-relaxed">
                  We collect information you voluntarily provide, including:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                  <li>Name and email address</li>
                  <li>Phone number</li>
                  <li>Account credentials and authentication data</li>
                  <li>Device configuration preferences</li>
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-[#111827] mb-2">Device and Usage Information</h3>
                <p className="leading-relaxed">
                  We automatically collect:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                  <li>Temperature and humidity readings from your IoT devices</li>
                  <li>Device identifiers and status information</li>
                  <li>Access logs and user activity within the application</li>
                  <li>Browser type, IP address, and device information</li>
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-[#111827] mb-2">Location Information</h3>
                <p className="leading-relaxed">
                  We may collect general location data only to the extent necessary for service optimization, never for tracking purposes. You can disable this through your device settings.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">3. How We Use Your Information</h2>
            <p className="leading-relaxed">We use the information we collect for purposes including:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Providing, maintaining, and improving our Services</li>
              <li>Processing transactions and sending related information</li>
              <li>Sending promotional communications (with your consent)</li>
              <li>Responding to your inquiries and providing customer support</li>
              <li>Monitoring and analyzing trends and usage patterns</li>
              <li>Detecting and preventing fraudulent transactions and other illegal activities</li>
              <li>Personalizing and improving user experience</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">4. Information Sharing</h2>
            <p className="leading-relaxed">
              We do not sell, trade, or rent your personal information. We may share information in the following circumstances:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>With service providers who assist us in operating our website and conducting business</li>
              <li>When required by law or to protect our legal rights</li>
              <li>In connection with a merger, acquisition, or sale of assets</li>
              <li>With your explicit consent</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">5. Data Security</h2>
            <p className="leading-relaxed">
              We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to use commercially acceptable means, we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">6. Data Retention</h2>
            <p className="leading-relaxed">
              We retain your personal information for as long as your account is active or as long as needed to provide Services. You may request deletion of your personal information at any time, subject to certain legal and operational requirements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">7. Your Privacy Rights</h2>
            <p className="leading-relaxed">Depending on your location, you may have the following rights:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>The right to access your personal information</li>
              <li>The right to correct inaccurate data</li>
              <li>The right to request deletion of your information</li>
              <li>The right to opt-out of marketing communications</li>
              <li>The right to data portability</li>
            </ul>
            <p className="leading-relaxed mt-3">
              To exercise these rights, please contact us at the email address provided in the "Contact Us" section.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">8. Third-Party Links</h2>
            <p className="leading-relaxed">
              Our Services may contain links to third-party websites. We are not responsible for the privacy practices of these external sites. We encourage you to review their privacy policies before providing any personal information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">9. Children's Privacy</h2>
            <p className="leading-relaxed">
              Our Services are not intended for individuals under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware of such collection, we will take steps to delete such information promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">10. Changes to This Privacy Policy</h2>
            <p className="leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. Your continued use of the Services after such modifications constitutes your acceptance of the updated Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">11. Contact Us</h2>
            <p className="leading-relaxed">
              If you have questions about this Privacy Policy or our privacy practices, please contact us at:
            </p>
            <div className="mt-3 p-4 rounded-xl bg-[#F9FAFB] border border-[#E4E7EC]">
              <p className="text-sm font-medium text-[#111827]">ColdWatch Privacy Team</p>
              <p className="text-sm text-[#6B7280] mt-1">Email: privacy@coldwatch.app</p>
            </div>
          </section>

          <div className="text-xs text-[#9CA3AF] pt-4 border-t border-[#E4E7EC]">
            <p>Last Updated: April 2026</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
