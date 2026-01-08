import { useConnect, useAccount, useDisconnect, useBalance, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { base } from "wagmi/chains";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Wallet, LogOut, Loader2, Check, AlertCircle, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { parseUnits } from "viem";
import { USDC_ADDRESS_BASE, ERC20_ABI, ENTRY_FEE_USDC, USDC_DECIMALS } from "@/lib/web3Config";
import { apiRequest } from "@/lib/queryClient";

const TREASURY_ADDRESS = "0x1234567890123456789012345678901234567890" as const;

interface WalletConnectProps {
  onPaymentSuccess: (sessionId: string) => void;
  referrerAddress?: string | null;
}

export function WalletConnect({ onPaymentSuccess, referrerAddress }: WalletConnectProps) {
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [paymentState, setPaymentState] = useState<"idle" | "paying" | "verifying" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const { data: usdcBalance } = useBalance({
    address,
    token: USDC_ADDRESS_BASE,
    chainId: base.id,
  });

  const { writeContract, data: txHash, error: writeError, isPending: isWritePending, reset: resetWrite } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (isConfirmed && txHash) {
      verifyAndCreateSession(txHash);
    }
  }, [isConfirmed, txHash]);

  useEffect(() => {
    if (writeError) {
      setPaymentState("error");
      setErrorMessage(writeError.message.includes("rejected") ? "Transaction rejected" : "Payment failed");
    }
  }, [writeError]);

  const verifyAndCreateSession = async (hash: string) => {
    setPaymentState("verifying");
    try {
      const response = await apiRequest("POST", "/api/sessions/create", {
        walletAddress: address,
        txHash: hash,
      });
      
      const data = await response.json();
      
      if (data.verified && data.sessionId) {
        setPaymentState("success");
        setTimeout(() => {
          onPaymentSuccess(data.sessionId);
        }, 1500);
      } else {
        setPaymentState("error");
        setErrorMessage(data.error || "Payment verification failed");
      }
    } catch (err) {
      setPaymentState("error");
      setErrorMessage("Failed to verify payment on blockchain");
    }
  };

  const registerPlayer = async () => {
    if (!address) return;
    try {
      await apiRequest("POST", "/api/players", {
        walletAddress: address,
        referredBy: referrerAddress || null,
      });
    } catch {
      // Player may already exist
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      registerPlayer();
    }
  }, [isConnected, address]);

  const handlePayment = async () => {
    if (!address) return;
    
    setPaymentState("paying");
    setErrorMessage("");

    try {
      const amount = parseUnits(ENTRY_FEE_USDC.toString(), USDC_DECIMALS);
      
      writeContract({
        address: USDC_ADDRESS_BASE,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [TREASURY_ADDRESS, amount],
      });
    } catch {
      setPaymentState("error");
      setErrorMessage("Payment failed. Please try again.");
    }
  };

  const resetPayment = () => {
    setPaymentState("idle");
    setErrorMessage("");
    resetWrite();
  };

  const isWrongNetwork = isConnected && chain?.id !== base.id;

  if (!isConnected) {
    return (
      <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#ff00ff" }}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="w-4 h-4" style={{ color: "#00ff00" }} />
            <p className="text-[10px]" style={{ color: "#00ffff" }}>
              SECURE BLOCKCHAIN PAYMENTS
            </p>
          </div>
          <p className="text-[8px] text-center" style={{ color: "#ff00ff" }}>
            $1 USDC ON BASE NETWORK
          </p>
          {connectors.map((connector) => (
            <Button
              key={connector.uid}
              onClick={() => connect({ connector })}
              disabled={isConnecting}
              className="w-full"
              style={{ 
                background: "linear-gradient(135deg, #9333ea, #7c3aed)",
                color: "#fff"
              }}
              data-testid={`button-connect-${connector.name.toLowerCase()}`}
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wallet className="w-4 h-4 mr-2" />
              )}
              {connector.name}
            </Button>
          ))}
        </div>
      </Card>
    );
  }

  if (isWrongNetwork) {
    return (
      <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#ff0000" }}>
        <div className="flex flex-col gap-3">
          <p className="text-[10px] text-center" style={{ color: "#ff0000" }}>
            WRONG NETWORK
          </p>
          <p className="text-[8px] text-center" style={{ color: "#888" }}>
            Please switch to Base network
          </p>
          <Button
            onClick={() => switchChain({ chainId: base.id })}
            className="w-full"
            style={{ background: "#0052ff", color: "#fff" }}
            data-testid="button-switch-network"
          >
            SWITCH TO BASE
          </Button>
        </div>
      </Card>
    );
  }

  const hasEnoughBalance = usdcBalance && Number(usdcBalance.formatted) >= ENTRY_FEE_USDC;

  return (
    <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#00ff00" }}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[8px]" style={{ color: "#888" }}>CONNECTED</p>
            <p className="text-[10px] font-mono" style={{ color: "#00ffff" }} data-testid="text-wallet-address">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => disconnect()}
            style={{ color: "#ff0000" }}
            data-testid="button-disconnect"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[8px]" style={{ color: "#888" }}>USDC BALANCE</span>
            <span 
              className="text-xs" 
              style={{ color: hasEnoughBalance ? "#00ff00" : "#ff0000" }}
              data-testid="text-usdc-balance"
            >
              ${usdcBalance ? Number(usdcBalance.formatted).toFixed(2) : "0.00"}
            </span>
          </div>
          
          <div className="flex justify-between items-center mb-3">
            <span className="text-[8px]" style={{ color: "#888" }}>ENTRY FEE</span>
            <span className="text-xs" style={{ color: "#ffff00" }}>$1.00 USDC</span>
          </div>

          {paymentState === "success" ? (
            <div className="flex flex-col items-center gap-2 py-3">
              <div className="flex items-center gap-2" style={{ color: "#00ff00" }}>
                <Check className="w-5 h-5" />
                <span className="text-xs">VERIFIED ON BLOCKCHAIN!</span>
              </div>
              <p className="text-[8px]" style={{ color: "#888" }}>Starting game...</p>
            </div>
          ) : paymentState === "verifying" ? (
            <div className="flex flex-col items-center gap-2 py-3">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#00ffff" }} />
              <span className="text-[10px]" style={{ color: "#00ffff" }}>
                VERIFYING ON BASE BLOCKCHAIN...
              </span>
              <p className="text-[8px]" style={{ color: "#888" }}>
                Checking {3} confirmations
              </p>
            </div>
          ) : paymentState === "error" ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-center gap-2 py-2" style={{ color: "#ff0000" }}>
                <AlertCircle className="w-4 h-4" />
                <span className="text-[10px]">{errorMessage}</span>
              </div>
              <Button
                onClick={resetPayment}
                className="w-full"
                variant="outline"
                style={{ borderColor: "#00ffff", color: "#00ffff" }}
              >
                TRY AGAIN
              </Button>
            </div>
          ) : !hasEnoughBalance ? (
            <div className="text-center py-2">
              <p className="text-[10px]" style={{ color: "#ff0000" }}>
                INSUFFICIENT USDC BALANCE
              </p>
              <p className="text-[8px] mt-1" style={{ color: "#888" }}>
                Bridge USDC to Base to play
              </p>
            </div>
          ) : (
            <Button
              onClick={handlePayment}
              disabled={isWritePending || isConfirming}
              className="w-full"
              style={{ 
                background: "linear-gradient(135deg, #00ff00, #22c55e)",
                color: "#000"
              }}
              data-testid="button-pay-entry"
            >
              {isWritePending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  CONFIRM IN WALLET...
                </>
              ) : isConfirming ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  WAITING FOR TX...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  PAY $1 USDC TO PLAY
                </>
              )}
            </Button>
          )}
        </div>

        <div className="text-center pt-2 border-t border-border">
          <p className="text-[7px]" style={{ color: "#666" }}>
            PAYMENTS VERIFIED ON-CHAIN
          </p>
          <p className="text-[7px]" style={{ color: "#666" }}>
            SCORES LINKED TO VERIFIED SESSIONS
          </p>
        </div>

        {referrerAddress && (
          <div className="text-center pt-2 border-t border-border">
            <p className="text-[8px]" style={{ color: "#ff00ff" }}>
              REFERRED BY
            </p>
            <p className="text-[8px] font-mono" style={{ color: "#888" }}>
              {referrerAddress.slice(0, 8)}...{referrerAddress.slice(-6)}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
