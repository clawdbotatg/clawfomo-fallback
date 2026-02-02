"use client";

import { useEffect, useState } from "react";
import { Address } from "@scaffold-ui/components";
import { formatEther } from "viem";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import externalContracts from "~~/contracts/externalContracts";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const CLAWD_TOKEN = externalContracts[8453].CLAWD.address;
const FOMO3D_ADDRESS = externalContracts[8453].ClawdFomo3D.address;
const TARGET_CHAIN_ID = 8453;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const POLL_MS = 3000;

export default function Home() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [numKeys, setNumKeys] = useState("1");
  const [isSwitching, setIsSwitching] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [clawdPrice, setClawdPrice] = useState(0);
  const [countdown, setCountdown] = useState("");

  // ── Contract Reads ──
  const { data: roundInfo } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getRoundInfo",
    query: { refetchInterval: POLL_MS },
  });

  const keysNum = parseInt(numKeys) || 0;
  const { data: cost } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "calculateCost",
    args: [BigInt(keysNum > 0 ? keysNum : 1)],
    query: { refetchInterval: POLL_MS },
  });

  const currentRound = roundInfo ? Number(roundInfo[0]) : 0;

  const { data: playerInfo } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getPlayer",
    args: [BigInt(currentRound || 1), address || ZERO_ADDR],
    query: { refetchInterval: POLL_MS },
  });

  const { data: clawdAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [address || ZERO_ADDR, FOMO3D_ADDRESS],
    query: { refetchInterval: POLL_MS },
  });

  const { data: clawdBalance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [address || ZERO_ADDR],
    query: { refetchInterval: POLL_MS },
  });

  const { data: totalUnclaimed } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "totalUnclaimedDividends",
    args: [address || ZERO_ADDR],
    query: { refetchInterval: POLL_MS, enabled: !!address },
  });

  // ── Contract Writes ──
  const { writeContractAsync: writeFomo } = useScaffoldWriteContract({ contractName: "ClawdFomo3D" });
  const { writeContractAsync: writeClawd } = useScaffoldWriteContract({ contractName: "CLAWD" });

  // ── Fetch CLAWD price ──
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${CLAWD_TOKEN}`);
        const data = await res.json();
        if (data.pairs?.[0]?.priceUsd) setClawdPrice(parseFloat(data.pairs[0].priceUsd));
      } catch {
        /* silent */
      }
    };
    fetchPrice();
    const iv = setInterval(fetchPrice, 30000);
    return () => clearInterval(iv);
  }, []);

  // ── Countdown Timer ──
  useEffect(() => {
    if (!roundInfo) return;
    const endTime = Number(roundInfo[2]);
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = endTime - now;
      if (diff <= 0) {
        setCountdown("00:00:00");
        return;
      }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      const pad = (n: number) => n.toString().padStart(2, "0");
      setCountdown(`${pad(h)}:${pad(m)}:${pad(s)}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [roundInfo]);

  // ── Formatters ──
  const fmtC = (val: bigint | undefined) => {
    if (!val) return "0";
    return Number(formatEther(val)).toLocaleString(undefined, { maximumFractionDigits: 0 });
  };
  const fmtCP = (val: bigint | undefined) => {
    if (!val) return "0";
    return Number(formatEther(val)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  };
  const toUsd = (val: bigint | undefined) => {
    if (!val || !clawdPrice) return "$0.00";
    const usd = Number(formatEther(val)) * clawdPrice;
    if (usd < 0.01) return "<$0.01";
    return `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // ── Handlers ──
  const handleSwitch = async () => {
    setIsSwitching(true);
    try {
      await switchChain({ chainId: TARGET_CHAIN_ID });
    } catch {
      notification.error("Failed to switch network");
    } finally {
      setIsSwitching(false);
    }
  };

  const handleApprove = async () => {
    if (!cost) return;
    setIsApproving(true);
    try {
      await writeClawd({ functionName: "approve", args: [FOMO3D_ADDRESS, cost * 5n] });
      notification.success("CLAWD approved ✅");
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || "Approval failed";
      if (!msg.toLowerCase().includes("user rejected")) notification.error(msg);
    } finally {
      setIsApproving(false);
    }
  };

  const handleBuy = async () => {
    if (keysNum <= 0 || keysNum > 1000) {
      notification.error("Enter 1-1000 keys");
      return;
    }
    setIsBuying(true);
    try {
      await writeFomo({ functionName: "buyKeys", args: [BigInt(keysNum)] });
      notification.success(`Bought ${keysNum} key${keysNum > 1 ? "s" : ""} 🔑`);
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || "Buy failed";
      if (!msg.toLowerCase().includes("user rejected")) notification.error(msg);
    } finally {
      setIsBuying(false);
    }
  };

  const handleClaimAll = async () => {
    if (!totalUnclaimed || totalUnclaimed === 0n) return;
    setIsClaiming(true);
    try {
      await writeFomo({ functionName: "claimAllDividends" });
      notification.success("Dividends claimed! 🦞");
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || "Claim failed";
      if (!msg.toLowerCase().includes("user rejected")) notification.error(msg);
    } finally {
      setIsClaiming(false);
    }
  };

  // ── Derived ──
  const isRoundActive = roundInfo ? Boolean(roundInfo[6]) : false;
  const wrongNetwork = chainId !== TARGET_CHAIN_ID;
  const needsApproval = cost && clawdAllowance !== undefined && clawdAllowance < cost;

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-8 max-w-lg mx-auto min-h-screen" data-theme="dark">
      {/* ── Title ── */}
      <div className="text-center">
        <h1 className="text-3xl font-black" style={{ color: "#f97316" }}>
          🐾 ClawFomo
        </h1>
        <p className="text-xs text-gray-400 mt-1">Fallback UI — last buyer wins the pot</p>
      </div>

      {/* ── Round Info Card ── */}
      <div className="w-full bg-base-200 rounded-2xl p-6 text-center space-y-3">
        <div className="text-xs text-gray-500 uppercase tracking-widest">
          Round {currentRound || "—"} {isRoundActive ? "• Active" : "• Ended"}
        </div>

        {/* Countdown */}
        <div className="text-5xl font-mono font-black" style={{ color: "#f97316" }}>
          {countdown || "--:--:--"}
        </div>

        {/* Pot */}
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider">Pot</div>
          <div className="text-2xl font-bold text-white">
            {roundInfo ? fmtC(roundInfo[1]) : "—"} <span className="text-sm text-gray-400">CLAWD</span>
          </div>
          {roundInfo && clawdPrice > 0 && <div className="text-sm text-gray-500">{toUsd(roundInfo[1])}</div>}
        </div>

        {/* Last Buyer */}
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider">👑 Last Buyer</div>
          <div className="flex justify-center mt-1">
            {roundInfo && roundInfo[3] && roundInfo[3] !== ZERO_ADDR ? (
              <Address address={roundInfo[3]} />
            ) : (
              <span className="text-gray-500 text-sm">No buyers yet</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Buy Keys Card ── */}
      <div className="w-full bg-base-200 rounded-2xl p-6 space-y-4">
        <div className="text-xs text-gray-500 uppercase tracking-widest text-center font-bold">Buy Keys</div>

        {/* Quantity Input */}
        <div>
          <input
            type="number"
            min="1"
            max="1000"
            value={numKeys}
            onChange={e => setNumKeys(e.target.value)}
            className="input input-bordered w-full text-center text-2xl font-bold bg-base-300"
            placeholder="1"
          />
          <div className="flex gap-1 mt-2">
            {[1, 5, 10, 50, 100].map(n => (
              <button
                key={n}
                className={`btn btn-xs flex-1 ${numKeys === String(n) ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setNumKeys(String(n))}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Cost Display */}
        {cost && (
          <div className="text-center bg-base-300 rounded-xl p-3">
            <div className="text-xs text-gray-500 uppercase">Cost</div>
            <div className="text-xl font-bold text-white">{fmtCP(cost)} CLAWD</div>
            <div className="text-sm text-gray-500">{toUsd(cost)}</div>
          </div>
        )}

        {/* Balance */}
        {address && clawdBalance !== undefined && (
          <div className="text-xs text-gray-500 text-center">
            Balance: {fmtC(clawdBalance)} CLAWD ({toUsd(clawdBalance)})
          </div>
        )}

        {/* Action Buttons — three-button flow */}
        <div className="space-y-2">
          {wrongNetwork ? (
            <button className="btn btn-warning w-full" disabled={isSwitching} onClick={handleSwitch}>
              {isSwitching ? <span className="loading loading-spinner loading-sm" /> : "Switch to Base"}
            </button>
          ) : needsApproval ? (
            <button
              className="btn w-full text-lg font-black"
              style={{ backgroundColor: "#f97316", color: "#000", borderColor: "#f97316" }}
              disabled={isApproving}
              onClick={handleApprove}
            >
              {isApproving ? <span className="loading loading-spinner loading-sm" /> : "🔓 Approve CLAWD"}
            </button>
          ) : (
            <button
              className="btn w-full text-lg font-black"
              style={{ backgroundColor: "#f97316", color: "#000", borderColor: "#f97316" }}
              disabled={isBuying || !isRoundActive}
              onClick={handleBuy}
            >
              {isBuying ? (
                <span className="loading loading-spinner loading-sm" />
              ) : !isRoundActive ? (
                "Round Ended"
              ) : (
                `Buy ${keysNum || 1} Key${keysNum > 1 ? "s" : ""} 🔑`
              )}
            </button>
          )}
        </div>

        {/* Uniswap Link */}
        <div className="text-center">
          <a
            href="https://app.uniswap.org/swap?outputCurrency=0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07&chain=base"
            target="_blank"
            rel="noopener noreferrer"
            className="link link-primary text-xs"
          >
            Buy $CLAWD on Uniswap →
          </a>
        </div>
      </div>

      {/* ── Player Stats Card ── */}
      {address && (
        <div className="w-full bg-base-200 rounded-2xl p-6 space-y-3">
          <div className="text-xs text-gray-500 uppercase tracking-widest text-center font-bold">
            Your Stats — Round {currentRound}
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Your Keys</span>
              <span className="font-bold text-white">{playerInfo ? Number(playerInfo[0]).toLocaleString() : "0"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Pending Dividends</span>
              <span className="font-bold text-white">{playerInfo ? fmtCP(playerInfo[1]) : "0"} CLAWD</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Claimed</span>
              <span className="text-gray-300">{playerInfo ? fmtCP(playerInfo[2]) : "0"} CLAWD</span>
            </div>
          </div>

          {/* Claim Dividends */}
          {totalUnclaimed && totalUnclaimed > 0n && (
            <div className="pt-2">
              <div className="text-center bg-base-300 rounded-xl p-3 mb-3">
                <div className="text-xs text-gray-500 uppercase">Total Unclaimed (All Rounds)</div>
                <div className="text-lg font-bold text-white">{fmtCP(totalUnclaimed)} CLAWD</div>
                <div className="text-sm text-gray-500">{toUsd(totalUnclaimed)}</div>
              </div>
              <button className="btn btn-success w-full" disabled={isClaiming || wrongNetwork} onClick={handleClaimAll}>
                {isClaiming ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  `Claim ${fmtC(totalUnclaimed)} CLAWD 🦞`
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Footer Info ── */}
      <div className="text-center text-xs text-gray-500 space-y-1 pb-4">
        <div>CLAWD: ${clawdPrice.toFixed(6)}</div>
        <div className="flex items-center justify-center gap-1">
          <span>Contract:</span> <Address address={FOMO3D_ADDRESS} size="xs" />
        </div>
        <div className="flex items-center justify-center gap-1">
          <span>Token:</span> <Address address={CLAWD_TOKEN} size="xs" />
        </div>
      </div>
    </div>
  );
}
