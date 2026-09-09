import { LegalHeader, SiteFooter } from '@/components/landing';

export const metadata = { title: 'Privacy Policy — Stack Bargains' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-lg font-bold text-slate-900">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <LegalHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900">Privacy Policy</h1>
        <p className="mb-10 text-sm text-slate-400">Last updated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <Section title="Who we are">
          <p>
            Stack Bargains ("we," "us") sells power tools and jobsite equipment, and operates an
            internal team platform for staff, hosts, and shippers. This policy explains what
            information we collect and how we use it.
          </p>
        </Section>

        <Section title="Information we collect">
          <p>When you sign in with Google, we receive your name, email address, and Google account ID from Google — nothing else.</p>
          <p>When you create an account directly, we collect the username, name, and password you provide.</p>
          <p>Our team platform separately records business operations data (sales, inventory, shipments) entered by our staff in the course of running the business — this is not collected from site visitors.</p>
        </Section>

        <Section title="How we use it">
          <p>We use this information to create and secure your account, sign you in, and determine what parts of the platform you can access based on your role.</p>
          <p>We do not sell your information, and we do not use it for advertising.</p>
        </Section>

        <Section title="Google sign-in">
          <p>
            Our use of information received from Google APIs adheres to the{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-[#DC2626] underline" target="_blank" rel="noopener noreferrer">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        <Section title="Data retention">
          <p>We keep account information for as long as your account is active. You can ask us to delete your account and associated data at any time using the contact below.</p>
        </Section>

        <Section title="Contact">
          <p>Questions about this policy or your data: <a href="mailto:brysonintl@gmail.com" className="text-[#DC2626] underline">brysonintl@gmail.com</a></p>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
