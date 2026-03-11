"use client";

// ---------------------------------------------------------------------------
// ShareControls -- Share buttons for report pages
// ---------------------------------------------------------------------------
// Copy link, native share (mobile), Twitter/X, Facebook share links,
// and a "Generate your own report" CTA. Uses navigator.share() when
// available, falling back to just the copy button.
// ---------------------------------------------------------------------------

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import { SectionHeader } from "@/components/SectionHeader";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShareControlsProps {
  /** The full address string for share text. */
  address: string;
  /** Report slug for building the canonical URL. */
  slug: string;
  /** Additional CSS classes. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Inline SVG icons (no external icon library)
// ---------------------------------------------------------------------------

function CopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function ShareIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function TwitterIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShareControls({
  address,
  slug,
  className = "",
}: ShareControlsProps) {
  const [copied, setCopied] = useState(false);
  const [supportsNativeShare, setSupportsNativeShare] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Detect native share support after hydration to avoid SSR/client mismatch (C1).
  useEffect(() => {
    setSupportsNativeShare(
      typeof navigator !== "undefined" && typeof navigator.share === "function"
    );
    return () => clearTimeout(copyTimerRef.current);
  }, []);

  const getReportUrl = useCallback(() => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/report/${slug}`;
    }
    return `/report/${slug}`;
  }, [slug]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getReportUrl());
      clearTimeout(copyTimerRef.current);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: textarea + execCommand for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = getReportUrl();
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (success) {
        clearTimeout(copyTimerRef.current);
        setCopied(true);
        copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
      }
    }
  }, [getReportUrl]);

  const handleNativeShare = useCallback(async () => {
    try {
      await navigator.share({
        title: `Locale: ${address}`,
        text: `Check out this neighborhood report for ${address} on Locale`,
        url: getReportUrl(),
      });
    } catch {
      // User cancelled or share failed -- no action needed.
    }
  }, [address, getReportUrl]);

  const handleTwitterShare = useCallback(() => {
    const text = `Check out this neighborhood report for ${address} on Locale`;
    const url = getReportUrl();
    const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(xUrl, "_blank", "noopener,noreferrer,width=550,height=420");
  }, [address, getReportUrl]);

  const handleFacebookShare = useCallback(() => {
    const url = getReportUrl();
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    window.open(facebookUrl, "_blank", "noopener,noreferrer,width=550,height=420");
  }, [getReportUrl]);

  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5 }}
      className={className}
    >
      <SectionHeader
        label="Share"
        title="Spread the Word"
        subtitle="Know someone who would find this useful? Share this report."
      />

      <div className="flex flex-wrap items-center gap-3">
        {/* Copy link */}
        <button
          onClick={handleCopyLink}
          aria-label={copied ? "Link copied to clipboard" : "Copy report link to clipboard"}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-all hover:border-accent hover:text-accent"
        >
          {copied ? (
            <>
              <CheckIcon className="text-accent" />
              <span className="text-accent">Copied!</span>
            </>
          ) : (
            <>
              <CopyIcon />
              <span>Copy link</span>
            </>
          )}
        </button>

        {/* Native share (mobile) */}
        {supportsNativeShare && (
          <button
            onClick={handleNativeShare}
            aria-label="Share this report"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-all hover:border-accent hover:text-accent"
          >
            <ShareIcon />
            <span>Share</span>
          </button>
        )}

        {/* Twitter/X */}
        <button
          onClick={handleTwitterShare}
          aria-label="Share on Twitter (opens in new window)"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-all hover:border-accent hover:text-accent"
        >
          <TwitterIcon />
          <span>Twitter</span>
        </button>

        {/* Facebook */}
        <button
          onClick={handleFacebookShare}
          aria-label="Share on Facebook (opens in new window)"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-all hover:border-accent hover:text-accent"
        >
          <FacebookIcon />
          <span>Facebook</span>
        </button>
      </div>

      {/* Generate your own report CTA */}
      <div className="mt-10 rounded-xl border border-border-light bg-surface-warm p-5 text-center sm:p-8">
        <h3 className="mb-3 font-serif">Curious about your neighborhood?</h3>
        <p className="mb-6 text-base text-ink-muted">
          Enter any US address and get your own AI-powered neighborhood
          intelligence report.
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-accent px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-light"
        >
          Generate your report
        </Link>
      </div>
    </motion.section>
  );
}
