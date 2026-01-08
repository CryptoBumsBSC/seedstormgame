import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem';
import { base } from 'viem/chains';

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_DECIMALS = 6;
const REQUIRED_CONFIRMATIONS = 3;

const publicClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

interface TransferLog {
  from: string;
  to: string;
  value: bigint;
}

export interface PaymentVerification {
  verified: boolean;
  from: string | null;
  to: string | null;
  amount: number | null;
  error?: string;
}

export async function verifyUSDCPayment(
  txHash: string,
  expectedFrom: string,
  expectedTo: string,
  expectedAmount: number
): Promise<PaymentVerification> {
  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    if (!receipt) {
      return { verified: false, from: null, to: null, amount: null, error: 'Transaction not found' };
    }

    if (receipt.status !== 'success') {
      return { verified: false, from: null, to: null, amount: null, error: 'Transaction failed' };
    }

    const currentBlock = await publicClient.getBlockNumber();
    const confirmations = Number(currentBlock - receipt.blockNumber);
    
    if (confirmations < REQUIRED_CONFIRMATIONS) {
      return { 
        verified: false, 
        from: null, 
        to: null, 
        amount: null, 
        error: `Waiting for confirmations (${confirmations}/${REQUIRED_CONFIRMATIONS})` 
      };
    }

    const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
    
    const usdcLogs = receipt.logs.filter(
      log => log.address.toLowerCase() === USDC_ADDRESS.toLowerCase()
    );

    for (const log of usdcLogs) {
      try {
        if (log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
          const from = '0x' + log.topics[1]?.slice(26);
          const to = '0x' + log.topics[2]?.slice(26);
          const value = BigInt(log.data);
          const amount = Number(formatUnits(value, USDC_DECIMALS));

          if (
            from.toLowerCase() === expectedFrom.toLowerCase() &&
            to.toLowerCase() === expectedTo.toLowerCase() &&
            amount >= expectedAmount
          ) {
            return {
              verified: true,
              from,
              to,
              amount,
            };
          }
        }
      } catch {
        continue;
      }
    }

    return { 
      verified: false, 
      from: null, 
      to: null, 
      amount: null, 
      error: 'No matching USDC transfer found' 
    };
  } catch (error) {
    return { 
      verified: false, 
      from: null, 
      to: null, 
      amount: null, 
      error: error instanceof Error ? error.message : 'Verification failed' 
    };
  }
}

export async function getTransactionStatus(txHash: string): Promise<'pending' | 'confirmed' | 'failed'> {
  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    if (!receipt) {
      return 'pending';
    }

    if (receipt.status === 'success') {
      const currentBlock = await publicClient.getBlockNumber();
      const confirmations = Number(currentBlock - receipt.blockNumber);
      return confirmations >= REQUIRED_CONFIRMATIONS ? 'confirmed' : 'pending';
    }

    return 'failed';
  } catch {
    return 'pending';
  }
}
