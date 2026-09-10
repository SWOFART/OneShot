import { useEffect, useState } from 'react';
import type { JobView } from '@oneshot/contracts';
import type { JobApiClient } from '../api/job-client.js';

export function JobWorkspace(props: {
  readonly client: JobApiClient;
  readonly onSelectIntent: (id: string) => void;
}) {
  const [jobs, setJobs] = useState<readonly JobView[]>([]);
  const [taskKey, setTaskKey] = useState('');
  const [subject, setSubject] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = async () => setJobs(await props.client.list());
  useEffect(() => {
    void refresh();
  }, []);

  async function start(): Promise<void> {
    try {
      const job = await props.client.start({
        task_key: taskKey,
        tool_id: 'team-report-v1',
        report_subject: subject,
      });
      setNotice(`Job ${job.job_id} is approved for the quoted 2.50 USDC testnet purchase.`);
      props.onSelectIntent(job.business_intent_id);
      await refresh();
    } catch {
      setNotice('The job was not started. Keep the same task key when retrying this request.');
    }
  }

  return (
    <section className="panel" aria-label="Jobs and results">
      <header>
        <h2>Company-data report</h2>
        <p>
          One team-operated testnet supplier. Quote: 2.50 USDC to <code>0x1111…1111</code> on Arc
          Testnet. Privy policy approval is required before payment.
        </p>
      </header>
      <label htmlFor="task-key">Stable task key</label>
      <input
        id="task-key"
        value={taskKey}
        onChange={(event) => setTaskKey(event.target.value)}
        placeholder="Keep this key for every retry"
      />
      <label htmlFor="report-subject">Report subject</label>
      <input
        id="report-subject"
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        placeholder="Company or domain"
      />
      <button
        type="button"
        disabled={!taskKey.trim() || !subject.trim()}
        onClick={() => void start()}
      >
        Approve and start job
      </button>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <h3>Jobs</h3>
      {jobs.length === 0 ? (
        <p>No jobs yet. Start a supported report above.</p>
      ) : (
        <ul className="attempts">
          {jobs.map((job) => (
            <li key={job.job_id}>
              <button
                type="button"
                className="secondary compact"
                onClick={() => props.onSelectIntent(job.business_intent_id)}
              >
                {job.task_key}
              </button>{' '}
              Payment: <strong>{job.payment_state}</strong>; delivery:{' '}
              <strong>{job.delivery_state}</strong>
              {job.result ? (
                <p>
                  <strong>Result ready:</strong> {job.result.report}
                </p>
              ) : job.payment_state === 'COMMITTED' ? (
                <button
                  type="button"
                  className="secondary compact"
                  onClick={() => void props.client.resume(job.job_id).then(refresh)}
                >
                  Resume delivery (never pays)
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
