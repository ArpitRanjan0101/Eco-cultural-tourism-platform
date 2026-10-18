import PlainText from '@/components/data-display/PlainText';
import Section from '@/components/layout/Section';

/** One cancellation tier as text: 48 h, 100 % → "48 hours or more before check-in: 100% refund". */
export function cancellationTierText({ hoursBeforeCheckIn, refundPercent }) {
  const when = hoursBeforeCheckIn === 0 ? 'Up to check-in' : hoursBeforeCheckIn % 24 === 0 ? `${hoursBeforeCheckIn / 24} ${hoursBeforeCheckIn === 24 ? 'day' : 'days'} or more before check-in` : `${hoursBeforeCheckIn} hours or more before check-in`;
  return `${when}: ${refundPercent === 0 ? 'no refund' : `${refundPercent}% refund`}`;
}

/**
 * Stay policies exactly as the API states them: cancellation tiers (most generous first), child, house and ID
 * rules. The refund itself is calculated by the backend at cancellation time (W4).
 * @param {{ policies: { cancellationPolicy: { tiers: Array<{ hoursBeforeCheckIn: number, refundPercent: number }>,
 *   notes?: string }, childPolicy: string|null, houseRules: string|null, identificationPolicy: string|null,
 *   isDefault: boolean } }} props
 */
export default function PropertyPolicies({ policies }) {
  const tiers = [...(policies.cancellationPolicy?.tiers ?? [])].sort((a, b) => b.hoursBeforeCheckIn - a.hoursBeforeCheckIn);
  const rules = [
    ['Children', policies.childPolicy],
    ['House rules', policies.houseRules],
    ['Identification', policies.identificationPolicy],
  ].filter(([, text]) => text?.trim());
  return (
    <Section id="policies" title="Policies" spacing="sm">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="font-sans text-base font-semibold">Cancellation</h3>
          {tiers.length ? (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {tiers.map((tier) => (
                <li key={tier.hoursBeforeCheckIn}>{cancellationTierText(tier)}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No cancellation terms published.</p>
          )}
          {policies.cancellationPolicy?.notes ? <PlainText text={policies.cancellationPolicy.notes} className="text-sm text-muted" /> : null}
          {policies.isDefault ? <p className="text-xs text-muted">The platform’s standard terms apply to this stay.</p> : null}
        </div>
        {rules.map(([title, text]) => (
          <div key={title} className="flex flex-col gap-2">
            <h3 className="font-sans text-base font-semibold">{title}</h3>
            <PlainText text={text} className="text-sm" />
          </div>
        ))}
      </div>
    </Section>
  );
}
