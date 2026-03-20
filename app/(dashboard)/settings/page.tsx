export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Settings</h1>
          <p className="mt-1 text-sm text-white/40">
            System configuration and account preferences for the FORGE platform.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
            <p className="text-xs font-mono uppercase tracking-widest text-white/30">Platform</p>
            <h2 className="mt-3 text-sm font-semibold text-white">Application Settings</h2>
            <p className="mt-2 text-sm text-white/55">
              Core platform settings will live here, including AI provider, environment checks, and system preferences.
            </p>
          </div>

          <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
            <p className="text-xs font-mono uppercase tracking-widest text-white/30">Account</p>
            <h2 className="mt-3 text-sm font-semibold text-white">Coach Profile</h2>
            <p className="mt-2 text-sm text-white/55">
              Profile, organization, and notification settings can be added here without changing the current app structure.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
