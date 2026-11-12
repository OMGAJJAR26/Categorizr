// Only QuickBooks is live for now; the other accounting tools are shown as unavailable.
const COMING_SOON_PROVIDERS = ["Sage", "Xero"];

const ComingSoonIntegrations = () =>
  COMING_SOON_PROVIDERS.map((name) => (
    <div
      key={name}
      aria-disabled="true"
      className="w-full px-3 py-2 text-sm text-gray-400 flex items-center justify-between gap-3 cursor-default select-none"
    >
      <span>{name}</span>
      <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
        Coming soon
      </span>
    </div>
  ));

export default ComingSoonIntegrations;
