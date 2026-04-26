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
              By accessing and using the ColdWatch IoT temperature and humidity monitoring dashboard ("Services"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">2. Use License</h2>
            <p className="leading-relaxed">
              Permission is granted to temporarily download one copy of the materials (information or software) on ColdWatch for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Modifying or copying the materials</li>
              <li>Using the materials for any commercial purpose or for any public display</li>
              <li>Attempting to reverse engineer, decompile, or disassemble any software contained on ColdWatch</li>
              <li>Removing any copyright or other proprietary notations from the materials</li>
              <li>Transferring the materials to another person or "mirroring" the materials on any other server</li>
              <li>Violating any applicable laws or regulations in connection with your access or use</li>
              <li>Accessing or searching the Services through the use of any engine, software, tool, agent, or device other than the software provided by ColdWatch</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">3. Disclaimer of Warranties</h2>
            <p className="leading-relaxed">
              The materials on ColdWatch are provided on an 'as is' basis. ColdWatch makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">4. Limitations of Liability</h2>
            <p className="leading-relaxed">
              In no event shall ColdWatch or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on ColdWatch, even if ColdWatch or an authorized representative has been notified orally or in writing of the possibility of such damage.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">5. Accuracy of Materials</h2>
            <p className="leading-relaxed">
              The materials appearing on ColdWatch could include technical, typographical, or photographic errors. ColdWatch does not warrant that any of the materials on its Services are accurate, complete, or current. ColdWatch may make changes to the materials contained on its Services at any time without notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">6. Materials and Content</h2>
            <p className="leading-relaxed">
              The materials on ColdWatch are protected by applicable copyright and trademark law. You agree not to modify the prints or copies of any materials and not to use any illustrations, photographs, video or audio sequences, or any graphics separately from the accompanying text.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">7. Limitations on Use</h2>
            <p className="leading-relaxed">
              The materials in ColdWatch are provided for lawful purposes only. You may not use this site or its content:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>For any unlawful purpose or to solicit others to commit unlawful acts</li>
              <li>To violate any international, federal, provincial, or state regulations, rules, laws, or local ordinances</li>
              <li>To infringe upon or violate intellectual property rights or other rights of others</li>
              <li>To harass or cause distress or inconvenience to any person</li>
              <li>To obscure or alter any copyright, trademark, or other proprietary notice</li>
              <li>To transmit obscene or offensive material</li>
              <li>To disrupt the normal flow of dialogue within ColdWatch's web properties</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">8. User Accounts</h2>
            <p className="leading-relaxed">
              If you create an account on ColdWatch, you are responsible for maintaining the confidentiality of your account information and password. You agree to accept responsibility for all activities that occur under your account. You agree to notify ColdWatch immediately of any unauthorized use of your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">9. Device Data and Monitoring</h2>
            <p className="leading-relaxed">
              The temperature, humidity, and other sensor data provided through ColdWatch is intended for informational purposes. While we strive for accuracy, sensor readings may have inherent limitations and error margins. ColdWatch is not responsible for any decisions made based on the data provided through our Services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">10. Modifications to Terms</h2>
            <p className="leading-relaxed">
              ColdWatch may revise these terms of service for its Services at any time without notice. By using this service, you are agreeing to be bound by the then current version of these terms of service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">11. Governing Law</h2>
            <p className="leading-relaxed">
              These terms and conditions are governed by and construed in accordance with the laws of the jurisdiction in which ColdWatch operates, and you irrevocably submit to the exclusive jurisdiction of the courts in that location.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">12. Indemnification</h2>
            <p className="leading-relaxed">
              You agree to indemnify, defend, and hold harmless ColdWatch and its affiliates, and their respective officers, directors, employees, agents, and successors from any and all claims, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or related to your use of the Services or violation of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">13. Termination</h2>
            <p className="leading-relaxed">
              ColdWatch may terminate or suspend your account and access to the Services immediately, without prior notice or liability, for any reason whatsoever, including if you breach the Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">14. Entire Agreement</h2>
            <p className="leading-relaxed">
              These Terms of Service and Privacy Policy constitute the entire agreement between you and ColdWatch regarding the use of the Services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#111827] mb-3">15. Contact Information</h2>
            <p className="leading-relaxed">
              If you have questions about these Terms of Service, please contact us at:
            </p>
            <div className="mt-3 p-4 rounded-xl bg-[#F9FAFB] border border-[#E4E7EC]">
              <p className="text-sm font-medium text-[#111827]">ColdWatch Legal Team</p>
              <p className="text-sm text-[#6B7280] mt-1">Email: legal@coldwatch.app</p>
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
