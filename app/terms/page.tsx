import { LegalHeader, SiteFooter } from '@/components/landing';

export const metadata = { title: 'Terms of Service — Stack Bargains' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-lg font-bold text-slate-900">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <LegalHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900">Terms of Service</h1>
        <p className="mb-10 text-sm text-slate-400">Last updated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <Section title="Using our site">
          <p>By using stackbargains.com or signing in to our team platform, you agree to these terms. If you don't agree, please don't use the site.</p>
        </Section>

        <Section title="Accounts">
          <p>You're responsible for keeping your account credentials secure and for activity that happens under your account. Team platform accounts are provisioned by an administrator and may be limited to specific roles and permissions.</p>
        </Section>

        <Section title="Acceptable use">
          <p>Don't use the site to do anything unlawful, to attempt to gain unauthorized access to other accounts or systems, or to disrupt the service for others.</p>
        </Section>

        <Section title="No warranty">
          <p>The site and platform are provided "as is." We don't guarantee they'll be uninterrupted or error-free.</p>
        </Section>

        <Section title="Changes">
          <p>We may update these terms from time to time. Continued use of the site after a change means you accept the updated terms.</p>
        </Section>

        <Section title="Contact">
          <p>Questions about these terms: <a href="mailto:brysonintl@gmail.com" className="text-[#DC2626] underline">brysonintl@gmail.com</a></p>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
