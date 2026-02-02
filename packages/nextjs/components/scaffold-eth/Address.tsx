import { BlockieAvatar } from "./BlockieAvatar";
import { getAddress } from "viem";

type AddressProps = {
  address?: string;
  format?: "short" | "long";
  size?: "xs" | "sm" | "base" | "lg";
};

/**
 * Simple address display with blockie avatar
 */
export const Address = ({ address, format = "short", size = "base" }: AddressProps) => {
  if (!address) return null;

  let checksumAddress: string;
  try {
    checksumAddress = getAddress(address);
  } catch {
    return <span className="text-error">Invalid address</span>;
  }

  const displayAddress =
    format === "long" ? checksumAddress : `${checksumAddress.slice(0, 6)}...${checksumAddress.slice(-4)}`;

  const textSize = size === "xs" ? "text-xs" : size === "sm" ? "text-sm" : size === "lg" ? "text-lg" : "text-base";

  return (
    <div className="flex items-center gap-2">
      <BlockieAvatar address={checksumAddress} size={24} />
      <a
        href={`https://basescan.org/address/${checksumAddress}`}
        target="_blank"
        rel="noreferrer"
        className={`link ${textSize} font-mono`}
      >
        {displayAddress}
      </a>
    </div>
  );
};
