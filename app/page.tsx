/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useMemo } from "react";
import { ethers, BrowserProvider, JsonRpcSigner, Contract } from "ethers";
import path from "path";

type TokenInfo = {
  symbol: string;
  address: string;
  decimals: number;
};

interface MetaMaskEthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
  on?: (event: string, callback: (...args: any[]) => void) => void;
  removeListener?: (event: string, callback: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: MetaMaskEthereumProvider;
  }
}

const TOKENS: TokenInfo[] = [
  { symbol: "ETH", address: ethers.ZeroAddress, decimals: 18 },
  {
    symbol: "DAI",
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    decimals: 18,
  },
  {
    symbol: "WETH",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    decimals: 18,
  },
  {
    symbol: "USDC",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
  },
];

const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // Uniswap V2 Router

const ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts)",
  "function swapExactETHForTokens(uint256 amountOutMin, address[] memory path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)",
  "function WETH() external pure returns (address)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] memory path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
];

export default function Home() {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [fromToken, setFromToken] = useState<TokenInfo>(TOKENS[0]);
  const [toToken, setToToken] = useState<TokenInfo>(TOKENS[1]);
  const [amountIn, setAmountIn] = useState<string>("0.001");
  const [isSwapping, setIsSwapping] = useState(false);
  const [estimatedOut, setEstimatedOut] = useState<string | null>(null);
  const [estimatedGas, setEstimatedGas] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [slippage, setSlippage] = useState<number>(0.5);

  const routerContract = useMemo(() => {
    if (!provider) return null;
    return new Contract(UNISWAP_ROUTER_ADDRESS, ROUTER_ABI, provider);
  }, [provider]);

  // useEffect that checks for an active ethereum wallet extension
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const initProvider = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = new BrowserProvider(window.ethereum as any);
        setProvider(p);

        // Check if already connected
        const accounts = (await window.ethereum!.request({
          method: "eth_accounts",
        })) as string[];
        if (accounts.length > 0) {
          const s = await p.getSigner();
          const addr = await s.getAddress();
          setSigner(s);
          setAccount(addr);
        }
      } catch (error) {
        console.error("Failed to initialize provider:", error);
      }
    };

    const handleAccountsChanged = async (accounts: unknown) => {
      const accountArray = accounts as string[];
      if (accountArray.length === 0) {
        setAccount(null);
        setSigner(null);
      } else {
        try {
          const p = new BrowserProvider(window.ethereum as any);
          const checksummedAddress = ethers.getAddress(accountArray[0]);
          setAccount(checksummedAddress);
          const s = await p.getSigner();
          setSigner(s);
        } catch (error) {
          console.error("Failed to handle account change:", error);
        }
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    initProvider();

    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", handleChainChanged);

    // Cleanup listeners on unmount
    return () => {
      if (window.ethereum?.removeListener) {
        window.ethereum.removeListener(
          "accountsChanged",
          handleAccountsChanged
        );
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, []);

  // Function for wallet connection
  async function connectWallet() {
    if (typeof window === "undefined" || !window.ethereum) {
      alert("Install Metamask or another injected ethereum wallet");
      return;
    }

    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      const p = new BrowserProvider(window.ethereum as any);
      const s = await p.getSigner();
      const addr = await s.getAddress();

      setProvider(p);
      setSigner(s);
      setAccount(addr);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      alert(
        error instanceof Error ? error.message : "Failed to connect wallet"
      );
    }
  }

  function toBigNumber(amountStr: string, decimals: number) {
    if (!amountStr || isNaN(Number(amountStr))) return ethers.toBigInt(0);
    const parts = amountStr.split(".");
    const whole = parts[0] || "0";
    let fraction = parts[1] || "";
    if (fraction.length > decimals) fraction = fraction.slice(0, decimals);
    while (fraction.length < decimals) fraction = fraction + "0";
    const wholeBN = ethers.toBigInt(whole);
    const fracBN = ethers.toBigInt(fraction || "0");
    const factor = ethers.toBigInt(10) ** BigInt(decimals);
    return wholeBN * factor + fracBN;
  }

  function fromBigNumber(bn: ethers.BigNumberish, decimals: number) {
    const s = bn.toString();
    if (decimals === 0) return s;
    if (s.length <= decimals) {
      return "0." + s.padStart(decimals, "0");
    }
    const whole = s.slice(0, s.length - decimals);
    const frac = s.slice(s.length - decimals).replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : whole;
  }

  async function estimateOutput() {
    setEstimatedOut(null);
    setEstimatedGas(null);

    if (!routerContract || !amountIn) return;
    try {
      const amountInBigN = toBigNumber(amountIn, fromToken.decimals);

      const wethAddress: string = await routerContract.WETH();
      let path: string[] = [];
      if (
        fromToken.address === ethers.ZeroAddress &&
        toToken.address === ethers.ZeroAddress
      ) {
        setEstimatedOut(amountIn);
        return;
      } else if (fromToken.address === ethers.ZeroAddress) {
        path = [wethAddress, toToken.address];
      } else if (toToken.address === ethers.ZeroAddress) {
        path = [fromToken.address, wethAddress];
      } else {
        path = [fromToken.address, toToken.address];
      }

      const amounts: ethers.BigNumberish[] = await routerContract.getAmountsOut(
        amountInBigN,
        path
      );
      const out = amounts[amounts.length - 1];
      setEstimatedOut(fromBigNumber(out, toToken.decimals));

      if (signer && provider) {
        const routerWithSigner = routerContract.connect(signer);
        try {
          const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
          const fromAddress = account ?? (await signer.getAddress());

          // Build unsigned transaction via populateTransaction
          let populatedTx: Partial<ethers.TransactionRequest> | undefined;
          if (fromToken.address === ethers.ZeroAddress) {
            populatedTx = await (routerWithSigner as any).populateTransaction.swapExactETHForTokens(
              0,
              path,
              fromAddress,
              deadline,
              { value: amountInBigN }
            );
          } else {
            populatedTx = await (routerWithSigner as any).populateTransaction.swapExactTokensForTokens(
              amountInBigN,
              0,
              path,
              fromAddress,
              deadline
            );
          }

          if (!populatedTx) {
            setEstimatedGas(null);
          } else {
            // Normalize txRequest for RPC/ethers calls
                        const txRequest: Record<string, any> = {
                          to: populatedTx.to,
                          data: populatedTx.data,
                          value: (populatedTx.value ?? ethers.toBigInt(0)),
                          from: fromAddress,
                        };

            let gasEstimate: bigint | null = null;

            // Try signer.estimateGas (preferred), then provider.estimateGas, then fallback to window.ethereum RPC
            try {
              // signer.estimateGas may exist on JsonRpcSigner
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              if (typeof (signer as any).estimateGas === "function") {
                // signer.estimateGas expects TransactionRequest; ensure value is bigint
                gasEstimate = await (signer as any).estimateGas(txRequest);
              } else {
                throw new Error("signer.estimateGas not available");
              }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (errSign) {
              try {
                if (typeof (provider as any).estimateGas === "function") {
                  gasEstimate = await (provider as any).estimateGas(txRequest);
                } else {
                  throw new Error("provider.estimateGas not available");
                }
              } catch (errProv) {
                // Fallback to raw RPC via window.ethereum
                try {
                  if (typeof window !== "undefined" && window.ethereum?.request) {
                    const rpcTx: Record<string, any> = {
                      to: txRequest.to,
                      data: txRequest.data,
                      from: txRequest.from,
                    };
                    if (txRequest.value && typeof txRequest.value === "bigint") {
                      rpcTx.value = "0x" + (txRequest.value as bigint).toString(16);
                    } else if (txRequest.value && typeof txRequest.value === "number") {
                      rpcTx.value = "0x" + (txRequest.value as number).toString(16);
                    }
                    const hexGas = await window.ethereum.request({
                      method: "eth_estimateGas",
                      params: [rpcTx],
                    }) as string;
                    gasEstimate = BigInt(hexGas);
                  }
                } catch (errRpc) {
                  console.error("RPC eth_estimateGas failed:", errRpc);
                }
              }
            }

            if (gasEstimate === null) {
              setEstimatedGas(null);
            } else {
              // show gas as decimal string
              setEstimatedGas(gasEstimate.toString());
            }
          }
        } catch (e) {
          console.error("Gas estimation failed:", e);
          setEstimatedGas(null);
        }
      }
    } catch (e) {
      console.error(e);
      setEstimatedGas(null);
    }
  }

  useEffect(() => {
    estimateOutput();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromToken, toToken, amountIn, signer]);


  async function approveIfNeeded(amountBigN: ethers.BigNumberish): Promise<boolean> {
    if (!signer) throw new Error("Wallet not connected");
    // For ETH, no approval needed
    if (fromToken.address === ethers.ZeroAddress) return true;

    const tokenContract = new ethers.Contract(fromToken.address, ERC20_ABI, signer);
    const allowance: ethers.BigNumberish = await tokenContract.allowance(account, UNISWAP_ROUTER_ADDRESS);
    if (BigInt(allowance.toString()) >= BigInt(amountBigN.toString())) return true;
    
    setIsApproving(true); 
    const tx = await tokenContract.approve(UNISWAP_ROUTER_ADDRESS, amountBigN);
    await tx.wait();
    setIsApproving(false);
    return true;
  }

  //MAIN SWAP FUNCTION
  async function perfromSwap() {
    if (!signer || !routerContract) {
      alert("Wallet not connected");
      return;
    }

    setIsSwapping(true);
    try {
      const amountInBigN = toBigNumber(amountIn, fromToken.decimals);
     const routerWithSigner = new ethers.Contract(
        UNISWAP_ROUTER_ADDRESS,
        ROUTER_ABI,
        signer
      );

      const wethAddress: string = await routerWithSigner.WETH();
      let path: string[] = [];
      if (
        fromToken.address === ethers.ZeroAddress) {
        path = [wethAddress, toToken.address];
      } else if (toToken.address === ethers.ZeroAddress) {
        path = [fromToken.address, wethAddress];
      } else {
        path = [fromToken.address, toToken.address];
      }

      // Check and calculate amountOutMin with slippage
      let outEstBN: ethers.BigNumberish;
      try {
        const amounts = await routerWithSigner.getAmountsOut(amountInBigN, path);
        outEstBN = amounts[amounts.length - 1];
      } catch {
        outEstBN = ethers.toBigInt(0);
      }

      // slippage calculation
      const slippageFactor = Math.max(0, 100 - slippage) / 100;
      // convert the estimated output to bigint and do integer math with BigInt
      const outEstBigInt = ethers.toBigInt(outEstBN);
      const slippageFactorInt = BigInt(Math.floor(slippageFactor * 10000));
      const amountOutMin = (outEstBigInt * slippageFactorInt) / ethers.toBigInt(10000);

      const deadline = Math.floor(Date.now() / 1000) + 60 * 10; // 10 minutes from now

      if (fromToken.address === ethers.ZeroAddress) {
        const tx = await routerWithSigner.swapExactETHForTokens(
          amountOutMin,
          path,
          account,
          deadline,
          { value: amountInBigN }
        );
        await tx.wait();
      } else {
        await approveIfNeeded(amountInBigN);
        const tx = await routerWithSigner.swapExactTokensForTokens(
          amountInBigN,
          amountOutMin,
          path,
          account,
          deadline
        );
        await tx.wait();
      }

      alert("Swap executed successfully!");
      setAmountIn("");
      setEstimatedOut(null);    
      setEstimatedGas(null);
    } catch (error) {
      console.error("Swap failed:", error);
      alert(error instanceof Error ? error.message : "Swap failed");
    } finally {
      setIsSwapping(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-[#020617] via-[#050810] to-[#04040a]">
      <main className="w-full max-w-3xl mx-4 my-12">
        <div className="relative rounded-2xl bg-gradient-to-br from-[#071027]/60 to-[#0b0b14]/60 backdrop-blur-md border border-[#2a2f55]/40 p-8 shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
          <div className="absolute -inset-px rounded-2xl pointer-events-none" style={{ boxShadow: '0 0 40px 8px rgba(99,102,241,0.08), inset 0 0 30px rgba(56,189,248,0.02)' }} />

          <header className="flex items-center justify-between mb-6">
            <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#6EE7B7] via-[#60A5FA] to-[#C084FC] drop-shadow-[0_8px_32px_rgba(99,102,241,0.12)]">
              MiniSwap
            </h1>
            <div className="flex items-center gap-3">
              {!account ? (
                <button
                  onClick={connectWallet}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-[linear-gradient(90deg,#06b6d4,#8b5cf6)] text-white shadow-[0_8px_30px_rgba(139,92,246,0.18)] hover:scale-[1.02] transition-transform"
                >
                  Connect Wallet
                </button>
              ) : (
                <div className="px-3 py-2 rounded-lg bg-[#061022]/60 border border-[#1f2340] text-sm text-[#cbd5e1] flex items-center gap-3">
                  <span className="px-2 py-1 rounded-md bg-[#071022] text-xs text-[#9ae6b4] font-semibold shadow-[0_4px_18px_rgba(34,197,94,0.08)]">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </span>
                </div>
              )}
            </div>
          </header>

          <section className="grid grid-cols-1 gap-6">
            <div className="p-6 rounded-xl bg-linear-to-br from-[#071026]/30 to-[#05040a]/20 border border-[#2b2f4a] shadow-[0_6px_30px_rgba(2,6,23,0.6)]">
              <div className="flex flex-col sm:flex-row gap-4 items-stretch">
                <div className="flex-1">
                  <label className="block mb-2 text-sm text-[#9aa9c2]">From</label>
                  <div className="flex gap-3 items-center">
                    <select
                      value={fromToken.address}
                      onChange={(e) =>
                        setFromToken(
                          TOKENS.find((t) => t.address === e.target.value) || TOKENS[0]
                        )
                      }
                      className="flex-1 py-3 px-3 rounded-xl bg-transparent border border-[#27314a] text-white placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#60a5fa]/40 transition"
                    >
                      {TOKENS.map((token) => (
                        <option key={token.address} value={token.address}>
                          {token.symbol}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      value={amountIn}
                      onChange={(e) => setAmountIn(e.target.value)}
                      className="w-40 py-3 px-3 rounded-xl bg-[#021026] border border-[#1f2a44] text-white text-right placeholder:text-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#06b6d4]/30"
                      placeholder="0.0"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#0f1724] to-[#061224] border border-[#2a2f55] flex items-center justify-center">
                    <svg className="w-6 h-6 text-[#8be9ff]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M7 7l10 10M17 7l-10 10" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>

                <div className="flex-1">
                  <label className="block mb-2 text-sm text-[#9aa9c2]">To</label>
                  <div className="flex gap-3 items-center">
                    <select
                      value={toToken.address}
                      onChange={(e) =>
                        setToToken(
                          TOKENS.find((t) => t.address === e.target.value) || TOKENS[1]
                        )
                      }
                      className="flex-1 py-3 px-3 rounded-xl bg-transparent border border-[#27314a] text-white placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#c084fc]/30 transition"
                    >
                      {TOKENS.map((token) => (
                        <option key={token.address} value={token.address}>
                          {token.symbol}
                        </option>
                      ))}
                    </select>

                    <div className="w-40 py-3 px-3 rounded-xl bg-[#021026] border border-[#1f2a44] text-white text-right">
                      {estimatedOut !== null ? (
                        <span className="text-sm">{estimatedOut}</span>
                      ) : (
                        <span className="text-sm text-[#6b7280]">--</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-sm text-[#9aa9c2]">
                  <span className="px-2 py-1 rounded-md bg-[#071026] text-[#9ae6b4] font-medium">Slippage</span>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={0.1}
                    value={slippage}
                    onChange={(e) => setSlippage(Number(e.target.value))}
                    className="w-48 accent-[#60a5fa]"
                  />
                  <span className="w-10 text-right text-white">{slippage}%</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-xs text-[#9aa9c2]">Estimated Gas</div>
                  <div className="px-3 py-1 rounded-md bg-[#071026] text-sm text-white border border-[#182033]">
                    {estimatedGas ?? "N/A"}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={perfromSwap}
                  disabled={isSwapping || isApproving || !account}
                  className="sm:col-span-2 w-full py-3 rounded-xl text-lg font-semibold text-white transition transform disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(90deg,#06b6d4 0%,#8b5cf6 60%)',
                    boxShadow: '0 8px 30px rgba(139,92,246,0.18), 0 0 40px rgba(6,182,212,0.08)'
                  }}
                >
                  {isSwapping ? "Swapping..." : isApproving ? "Approving..." : "Swap Now"}
                </button>

                <button
                  onClick={() => { setAmountIn(""); setEstimatedOut(null); }}
                  className="w-full py-3 rounded-xl border border-[#2b324b] text-sm text-[#cbd5e1] bg-[#021026]"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-br from-[#051022]/30 to-[#02020a]/20 border border-[#1f2740] text-sm text-[#9aa9c2]">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[#9aa9c2]">Estimated Output</div>
                <div className="text-white font-medium">{estimatedOut ?? "N/A"}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-[#9aa9c2]">Estimated Gas</div>
                <div className="text-white font-medium">{estimatedGas ?? "N/A"}</div>
              </div>
            </div>
          </section>

          <footer className="mt-6 text-xs text-[#6b7280]">
            <div>Be careful. Always verify token contract addresses before swapping.</div>
          </footer>
        </div>
      </main>
    </div>
  );
}
