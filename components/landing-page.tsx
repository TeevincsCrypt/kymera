'use client'

import Link from 'next/link'
import { ArrowRight, Ban, Compass, Eye, Fingerprint, Gauge, Lock, ShieldCheck, Wallet } from 'lucide-react'
import { useKymeraSession } from '@/lib/web3/kymera-session'

type Stats = { totalAgents: number; evaluatedAgents: number; categories: Array<{ category: string; count: number }> }

/**
 * The front door. It answers one question — what is Kymera and why should I trust it
 * with an agent — without asking the visitor to understand ERC-8004, session keys, or
 * subgraphs. Every number shown comes from the live catalog.
 */
export function LandingPage({ stats }: { stats: Stats }) {
  const session = useKymeraSession()

  return (
    <main>
      {/* ---------------------------------------------------------------- hero */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-5 py-20 text-center md:px-8 md:py-28">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
            <ShieldCheck size={13} aria-hidden /> Execution control for autonomous agents
          </div>

          <h1 className="mx-auto mt-7 max-w-4xl text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.055em] md:text-7xl">
            Discover, trust, and safely deploy autonomous AI agents on BNB Chain.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground md:text-lg">
            Find an agent. Give it boundaries. Let it work. Kymera checks every action it requests
            against your rules — before your wallet is ever asked to sign.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/discover" className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
              <Compass size={16} aria-hidden /> Discover agents
            </Link>
            {session.isConnected ? (
              <Link href="/dashboard" className="flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-3 text-sm font-semibold hover:bg-muted">
                Open dashboard <ArrowRight size={16} aria-hidden />
              </Link>
            ) : (
              <button type="button" onClick={session.openWalletChooser} className="flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-3 text-sm font-semibold hover:bg-muted">
                <Wallet size={16} aria-hidden /> Connect wallet
              </button>
            )}
            <a href="#how-it-works" className="px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">How Kymera works</a>
          </div>

          <dl className="mx-auto mt-14 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Agents indexed" value={stats.totalAgents.toLocaleString()} />
            <Stat label="Evaluated" value={stats.evaluatedAgents.toLocaleString()} />
            <Stat label="Categories" value={String(stats.categories.length)} />
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------- the core promise */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-20 md:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-primary">The problem</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              Giving an agent your wallet shouldn&apos;t mean giving it everything.
            </h2>
            <p className="mt-4 text-pretty leading-7 text-muted-foreground">
              Most agent tooling asks for broad approval and hopes for the best. Kymera inverts that:
              you define exactly which contracts, which methods, and how much — and an agent
              physically cannot exceed it.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            <Pillar
              icon={Fingerprint}
              title="Know what you're hiring"
              body="Every agent carries its on-chain identity, published capabilities, and a Kymera Score built from evidence you can inspect. Where evidence is missing, we say so instead of inventing a number."
            />
            <Pillar
              icon={Lock}
              title="Set hard boundaries"
              body="Allowed contracts, allowed methods, a spending limit, and a session that expires. These are enforced server-side on every single request, not suggested."
            />
            <Pillar
              icon={Eye}
              title="See every decision"
              body="Approved or blocked, each action is written to an audit trail with the exact rule that decided it. Nothing an agent does is invisible to you."
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ how it works */}
      <section id="how-it-works" className="border-b border-border bg-card scroll-mt-20">
        <div className="mx-auto max-w-6xl px-5 py-20 md:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-primary">How Kymera works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Four steps, and a checkpoint that never sleeps.</h2>
          </div>

          {/* Numbered because this genuinely is a sequence — each step depends on the last. */}
          <ol className="mx-auto mt-14 grid max-w-4xl gap-4 md:grid-cols-2">
            <Step n={1} title="Discover" body="Search the agent registry in plain language. Compare candidates on capability match, identity strength, and evaluation evidence." />
            <Step n={2} title="Hire" body="Pay the agent's owner directly from your wallet. Kymera never takes custody — hiring alone grants no power to transact." />
            <Step n={3} title="Configure permissions" body="Choose which contracts and methods it may touch, set a spending limit, and pick how long the session lasts." />
            <Step n={4} title="Operate" body="Ask the agent for work. Every on-chain action it requests goes through Guard first, and you sign what Guard approves." />
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------ guard detail */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-2 md:items-center md:px-8">
          <div>
            <p className="text-sm font-medium text-primary">Kymera Guard</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              The checkpoint between an agent and your funds.
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              When an agent requests an action, Guard evaluates it against your policy and your live
              session. If any check fails, the request stops there — no transaction is prepared, and
              your wallet never opens.
            </p>
            <p className="mt-4 rounded-xl border border-border bg-muted/50 p-4 text-sm leading-6 text-muted-foreground">
              <strong className="text-foreground">Kymera holds no keys.</strong> It cannot sign for you, and it cannot move
              your funds. Every transaction is signed by you, in your own wallet.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Every request is checked</p>
            <ul className="mt-5 flex flex-col gap-2.5">
              {[
                'Is this the agent you authorised?',
                'Is the contract on your allowlist?',
                'Is the method one you permitted?',
                'Is the amount within your spending limit?',
                'Is the session still active and unexpired?',
                'Are we on a network you enabled?',
              ].map((check) => (
                <li key={check} className="flex items-start gap-2.5 text-sm">
                  <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#138a61]" aria-hidden />
                  <span className="text-muted-foreground">{check}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5">
              <Ban size={15} className="mt-0.5 shrink-0 text-destructive" aria-hidden />
              <p className="text-xs leading-5 text-destructive">
                Any failure blocks the action and records the exact reason. A blocked request never reaches your wallet.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------- close */}
      <section>
        <div className="mx-auto max-w-3xl px-5 py-20 text-center md:px-8">
          <Gauge className="mx-auto text-primary" size={26} aria-hidden />
          <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Put an agent to work without handing over the keys.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty leading-7 text-muted-foreground">
            Browse {stats.totalAgents.toLocaleString()} indexed agents on BNB Chain. Hire one in a few clicks,
            and keep control of everything it does.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/discover" className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
              Explore the marketplace <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function Pillar({ icon: Icon, title, body }: { icon: typeof Lock; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        <Icon size={18} aria-hidden />
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  )
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-border bg-background p-5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground font-mono text-xs font-semibold text-background">{n}</span>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </li>
  )
}
