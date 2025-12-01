import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { mainnet } from "viem/chains";
import routerABI from "./routerABI.json";
// import { Abi } from "viem";



// UNISWAP ROUTER ADDRESS
export const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";


// PUBLIC CLIENT
export const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(),
});


// WALLET CONNECTION
export const getWalletClient = async (account: `0x${string}`) => {
    return createWalletClient({
        chain: mainnet,
        transport: http(),
        account,
    });
};



// GETS OUTPUT AMOUNT FROM UNISWAP ROUTER
export async function getOutputAmount(amountIn: string, path:string[]): Promise<bigint[]> {
    return publicClient.readContract({
        address: UNISWAP_ROUTER_ADDRESS,
        abi: routerABI,
        functionName: "getAmountsOut",
        args: [parseEther(amountIn), path],
    }) as Promise<bigint[]>;
}

// FUNCTION TO EXECUTE SWAP
export async function swapExactETHForTokens( account: `0x${string}`, token: `0x${string}`) {
    const walletClient = await getWalletClient(account);

    const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const path = [weth, token];


    return walletClient.writeContract({
        address: UNISWAP_ROUTER_ADDRESS,
        abi: routerABI,
        functionName: "swapExactETHForTokens",
        value: parseEther("0.01"),
        args: [
            0,
            path,
            account,
            BigInt(Math.floor(Date.now() / 1000) + 60 * 20)
            ]
        });
}   