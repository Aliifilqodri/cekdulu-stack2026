import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BlankoState,
  computeLocationConsensus,
  CONFIRMATION_WEIGHT_THRESHOLD,
  evaluateTrustedReporter,
  NetworkState,
  OfficerState,
  QueueBucket,
  REPORT_TTL_SECONDS,
  ReportCondition,
  resolveVoteWeight,
  SummaryStatus,
  UserRole,
} from "@cekdulu/shared";
import { REDIS_KEYS } from "../src/lib/redis";

describe("Crowdsourcing Consensus, Weighting & Redis Key Engine", () => {
  const now = new Date("2026-11-26T10:00:00.000Z");
  const expiresAt = new Date(now.getTime() + REPORT_TTL_SECONDS * 1000);

  it("menetapkan bobot 1 warga biasa, 2 Trusted Reporter (akurasi >= 90% & min 10 laporan), dan 3 pengurus resmi", () => {
    assert.equal(CONFIRMATION_WEIGHT_THRESHOLD, 3);
    assert.equal(REPORT_TTL_SECONDS, 7200);
    assert.equal(REDIS_KEYS.summaryCache("loc-123"), "location:status:loc-123");

    assert.equal(resolveVoteWeight(UserRole.WARGA, false, false), 1);
    assert.equal(resolveVoteWeight(UserRole.WARGA, true, false), 2);
    assert.equal(resolveVoteWeight(UserRole.PENGURUS_RT, false, true), 3);

    // Kurang dari 10 laporan -> belum Trusted Reporter meski 100% akurat
    assert.deepEqual(evaluateTrustedReporter(9, 9), {
      isTrustedReporter: false,
      voteWeight: 1,
    });
    // 10 laporan dengan 8 cocok (80%) -> belum memenuhi >= 90%
    assert.deepEqual(evaluateTrustedReporter(10, 8), {
      isTrustedReporter: false,
      voteWeight: 1,
    });
    // 10 laporan dengan 9 cocok (90%) -> Trusted Reporter (bobot 2)
    assert.deepEqual(evaluateTrustedReporter(10, 9), {
      isTrustedReporter: true,
      voteWeight: 2,
    });
  });

  it("konsensus belum terkonfirmasi jika total weight_score < 3", () => {
    const result = computeLocationConsensus([
      {
        id: "r1",
        userId: "warga-1",
        conditionType: ReportCondition.ANTRE,
        queueRange: QueueBucket.B_5_15,
        weightScore: 1,
        createdAt: now,
        expiresAt,
      },
      {
        id: "r2",
        userId: "warga-2",
        conditionType: ReportCondition.ANTRE,
        queueRange: QueueBucket.B_5_15,
        weightScore: 1,
        createdAt: now,
        expiresAt,
      },
    ]);

    assert.equal(result.totalWeight, 2);
    assert.equal(result.isConfirmed, false);
    assert.equal(result.currentStatus, SummaryStatus.UNKNOWN);
    assert.deepEqual(result.confirmedReportIds, []);
  });

  it("terkonfirmasi pada total weight_score >= 3 (3 warga biasa @1 atau 1 Trusted Reporter @2 + 1 warga biasa @1)", () => {
    const trustedPlusCitizen = computeLocationConsensus([
      {
        id: "r1",
        userId: "trusted-1",
        conditionType: ReportCondition.ANTRE,
        queueRange: QueueBucket.B_15_30,
        weightScore: 2,
        createdAt: now,
        expiresAt,
      },
      {
        id: "r2",
        userId: "warga-1",
        conditionType: ReportCondition.ANTRE,
        queueRange: QueueBucket.B_15_30,
        weightScore: 1,
        createdAt: now,
        expiresAt,
      },
    ]);

    assert.equal(trustedPlusCitizen.totalWeight, 3);
    assert.equal(trustedPlusCitizen.isConfirmed, true);
    assert.equal(trustedPlusCitizen.currentStatus, SummaryStatus.ANTRE);
    assert.equal(trustedPlusCitizen.queueEstimate, QueueBucket.B_15_30);
    assert.equal(trustedPlusCitizen.officerStatus, OfficerState.DI_LOKET);
    assert.equal(trustedPlusCitizen.networkStatus, NetworkState.NORMAL);
    assert.equal(trustedPlusCitizen.blankoStatus, BlankoState.ADA);
    assert.deepEqual(trustedPlusCitizen.confirmedReportIds, ["r1", "r2"]);
  });

  it("mengabaikan laporan dengan is_hidden = TRUE dan mereset status ke unknown bila tidak ada laporan aktif", () => {
    const hiddenOnly = computeLocationConsensus([
      {
        id: "r1",
        userId: "u1",
        conditionType: ReportCondition.BLANKO_HABIS,
        weightScore: 2,
        isHidden: true,
        createdAt: now,
        expiresAt,
      },
      {
        id: "r2",
        userId: "u2",
        conditionType: ReportCondition.BLANKO_HABIS,
        weightScore: 1,
        isHidden: true,
        createdAt: now,
        expiresAt,
      },
    ]);

    assert.equal(hiddenOnly.isConfirmed, false);
    assert.equal(hiddenOnly.currentStatus, SummaryStatus.UNKNOWN);
    assert.equal(hiddenOnly.confirmationCount, 0);

    const empty = computeLocationConsensus([]);
    assert.equal(empty.currentStatus, SummaryStatus.UNKNOWN);
    assert.equal(empty.expiresAt, null);
  });
});
