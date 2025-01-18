const { ethers } = require('ethers')
const prompt = require('prompt-sync')()
require('dotenv').config()

const RPC_URL = 'https://assam-rpc.tea.xyz/'
const CHAIN_ID = 93384
const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID)

// ERC20 Token ABI - minimal ABI for transfer function and decimals
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
]

function generateRandomAddress() {
  return ethers.Wallet.createRandom().address
}

function safeJSONParse(str, defaultValue = []) {
  try {
    if (!str) return defaultValue;
    const cleanStr = str.trim().replace(/^\uFEFF/, '');
    return JSON.parse(cleanStr);
  } catch (error) {
    console.error('Error parsing PRIVATE_KEYS from .env file:', error.message);
    console.error('Please ensure your .env file has the correct format:');
    console.log('PRIVATE_KEYS=["privatekey1", "privatekey2", ...]');
    process.exit(1);
  }
}

async function main() {
  // Get private keys from .env
  const privateKeys = safeJSONParse(process.env.PRIVATE_KEYS);

  if (privateKeys.length === 0) {
    console.error('No private keys found in .env file');
    process.exit(1);
  }

  console.log(`Found ${privateKeys.length} private keys`);

  // Create wallets from private keys
  let wallets = [];
  for (const privateKey of privateKeys) {
    try {
      const wallet = new ethers.Wallet(privateKey.trim(), provider);
      wallets.push(wallet);
    } catch (error) {
      console.error(`Invalid private key: ${error.message}`);
    }
  }

  if (wallets.length === 0) {
    console.error('No valid wallets could be created. Please check your private keys.');
    process.exit(1);
  }

  // Get token contract address from user
  const tokenAddress = prompt('Enter the ERC20 token contract address: ');
  if (!ethers.isAddress(tokenAddress)) {
    console.error('Invalid token address provided');
    process.exit(1);
  }

  const amountToSend = prompt('How much tokens do you want to send: ');
  if (isNaN(amountToSend) || amountToSend <= 0) {
    console.error('Invalid amount provided');
    process.exit(1);
  }

  const numAddresses = parseInt(prompt('How many addresses do you want to send to: '));
  if (isNaN(numAddresses) || numAddresses <= 0) {
    console.error('Invalid number of addresses provided');
    process.exit(1);
  }

  // Create contract instance
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

  try {
    const decimals = await tokenContract.decimals();
    const amountInWei = ethers.parseUnits(amountToSend.toString(), decimals);
    const delayBetweenTransactions = 1000;

    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      const tokenWithSigner = tokenContract.connect(wallet);

      try {
        // Check token balance
        const balance = await tokenContract.balanceOf(wallet.address);
        const balanceInTokens = ethers.formatUnits(balance, decimals);
        console.log(`Wallet ${wallet.address} token balance: ${balanceInTokens}`);

        if (balance < amountInWei) {
          console.error(`Wallet ${wallet.address} has insufficient token balance. Skipping transactions for this wallet.`);
          continue;
        }

        const gasPrice = await provider.getFeeData().then((feeData) => feeData.gasPrice);

        for (let j = 0; j < numAddresses; j++) {
          const randomAddress = generateRandomAddress();

          try {
            // Send ERC20 tokens
            const tx = await tokenWithSigner.transfer(randomAddress, amountInWei, {
              gasLimit: 200000,
              gasPrice: gasPrice
            });

            console.log(`Sent ${amountToSend} tokens from ${wallet.address} to ${randomAddress}`);
            console.log(`Tx Hash: ${tx.hash}`);

            // Wait for transaction confirmation
            await tx.wait();
            console.log('Transaction confirmed');

          } catch (error) {
            console.error(`Failed to send tokens from ${wallet.address} to ${randomAddress}:`, error.message);
          }

          if (j < numAddresses - 1) {
            await new Promise((resolve) => setTimeout(resolve, delayBetweenTransactions));
          }
        }
      } catch (error) {
        console.error(`Error processing wallet ${wallet.address}:`, error.message);
      }

      if (i < wallets.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenTransactions));
      }
    }
  } catch (error) {
    console.error('Error interacting with token contract:', error.message);
  }
}

main().catch((error) => {
  console.error('Error in main function:', error.message);
  process.exit(1);
});