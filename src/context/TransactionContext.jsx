import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import axios from "axios";
import { contractABI, contractAddressABI, gunStoreAddress } from "../utils_contract/details";
import trainingPrices from '../weapons/trainingPrices'

const addressRoute = "https://gun-store-blockchain.herokuapp.com/weapons"
// const addressRoute = "http://localhost:4000/weapons"

export const TransactionContext = React.createContext();

const { ethereum } = window;
const createContractEth = () => {
  // new ethereum contract with the ABI and details of signer by the provider
  const provider = new ethers.providers.Web3Provider(ethereum);
  const signer = provider.getSigner();

  const tsxContract = new ethers.Contract(
    contractAddressABI,
    contractABI,
    signer
  );


  return tsxContract;
}
export const TransactionProvider = ({ children }) => {
  // state for wallet account
  const [currentAccount, setCurrentAccount] = useState("");


  //state for the account transaction to be viewd in the transaction page when the user logged in to his wallet
  const [accountTransactions, setTransactions] = useState([]);
  //state for the account weapons to be viewd in the weapons page when the user logged in to his wallet.
  const [accountWeapons, setAccountWeapons] = useState([]);
  //state for the weapons for sale to be viewd in the for sale page.
  const [weaponsForSale,setWeaponsForSale] = useState([]);

  const getAccountTransactions = async () => {
    try {
      if (ethereum) {
        const tsxContract = createContractEth();
        const transactions = await tsxContract.getTransactions();

        const newTsxData = transactions.map((ts) => ({
          addressTo: ts.receiver,
          addressFrom: ts.sender,
          timestamp: new Date(ts.timestamp.toNumber() * 1000).toLocaleString(),
          weapon: ts.weapon,
          //WEI to ETH 10^18
          amount: parseInt(ts.amount._hex) / (10 ** 18),
          weaponType: ts.weaponType,
          weaponUrl: ts.weaponUrl

        }))
        setTransactions(newTsxData)
      }
      else {
        console.log("Etheruem problem, try again");
      }
    } catch (error) {
      console.log(error);
    }
  }
  //handle user accounts and if accounts has changed
  const checkIfWalletConnected = async () => {
    try {
      if (!ethereum) return alert("Please connect to MetaMask.");
      const accounts = await ethereum.request({ method: "eth_accounts" });
      if (accounts.length) {
        //set the account to be our main account(0)
        setCurrentAccount(accounts[0]);
        //setting the account transactions so we can show his data as the current state.
        getAccountTransactions();
      }
      // NOT SURE IF NEEDED THE ELSE PART
      // } else {
      //   return alert("Please register to MetaMask.");
      // }
    } catch (error) {
      console.log(error);
      throw new Error("No Eth Object");
    }
  };
  // handle new connection for metamask account
  const connectWallet = async () => {
    try {
      if (!ethereum) return alert("Please connect to MetaMask.");
      //getting the ethereum account after user connects his account.
      const accounts = await ethereum.request({
        method: "eth_requestAccounts",
      });
      setCurrentAccount(accounts[0]);
      // const account = { account_metamask_address: accounts[0]}
      getAccountWeapons()

    } catch (error) {
      console.log(error);
      throw new Error("No Eth Object");
    }
  };

  const handleWeaponForSale = async (weapon) =>{
    try {
      await axios.post(`${addressRoute}/updateForSale`, { _id: weapon._id, weapon_for_sale:weapon.weapon_for_sale })
    } catch (error) {
      console.log(error);
    }
  }



  const handleTrainingPrice = async (weapon) => {
    try {
      let newPrice = Number(weapon.weapon_price) + Number(trainingPrices[weapon.weapon_type][weapon.training_index])
      newPrice = newPrice.toFixed(5)
      weapon.weapon_training[weapon.training_index]++
      await axios.post(`${addressRoute}/updatePrice`, { _id: weapon._id, weapon_price: newPrice, weapon_training: weapon.weapon_training })
    } catch (error) {

    }
  }

  const handleWeaponIdleTime = async (weapon) => {
    try {
      let idle_time = (Date.now() - new Date(weapon.timestamp).getTime())
      idle_time = Math.floor((idle_time / (1000 * 60 * 60)).toFixed(6))
      if (weapon.weapon_training["idle_time"] === idle_time) return
      else {
        weapon.weapon_training["idle_time"] = idle_time
        let newPrice = weapon.weapon_price - idle_time * trainingPrices[weapon.weapon_type]["idle"]
        newPrice = newPrice.toFixed(6)
        await axios.post(`${addressRoute}/idlePrice`, { _id: weapon._id, weapon_price: newPrice, weapon_training: weapon.weapon_training })
      }
    } catch (error) {
      console.log(error);
    }
  }

  const handleNewTransaction = async (userWeapon) => {
    try {
      if (ethereum){
      //we want to make an update for the database first so we can have the object id,
      //the purpose of this order is that we want to add to the blockchain the id so we can
      //manage the sales for weapons properly.
        const weaponToAdd = {
          weapon_name: userWeapon.weapon,
          weapon_type: userWeapon.type,
          weapon_price: userWeapon.price,
          weapon_url: userWeapon.url,
          timestamp: Date.now(),
          account_metamask_address: currentAccount
        }
        await axios.post(`${addressRoute}/add`, weaponToAdd)
        const lastWeaponAdded = await axios.get(`${addressRoute}/getLastWeapon`)
        console.log(lastWeaponAdded.data[0]._id);

      // new ethereum contract with the ABI and details of signer by the provider
      const tsxContract = createContractEth()



      //ethereum request for sending the new transaction with metamask
      await ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: currentAccount,
            to: userWeapon ? gunStoreAddress : userInputData.addressTo,
            //The value transferred for the transaction in WEI.
            //Parse the ether string representation of ether into a number instance of the amount of wei.
            value: userWeapon ? ethers.utils.parseEther(userWeapon.price)._hex : ethers.utils.parseEther(userInputData.amount)._hex,
          },
        ],
      });

      //adding the new transaction to the blockchain with the solidity contract
      const tsHash = await tsxContract.addToBlockchain(
        gunStoreAddress,
        ethers.utils.parseEther(userWeapon.price)._hex ,
        userWeapon.weapon,
        userWeapon.type,
        userWeapon.url,
        lastWeaponAdded.data[0]._id,
      );

      await tsHash.wait()

      }
      else{
        console.log("Ethereum is not present");
      }
     
    } catch (error) {
      const last = await axios.get(`${addressRoute}/getLastWeapon`)
      //delete the weapon from database incase of an error in the transaction.
      await axios.post(`${addressRoute}/delete`,{_id:last.data[0]._id})
      console.log(error);
      throw new Error("No Eth Object");
    }
  };

  const getAccountWeapons = async () => {
    try {
      const res = await axios.post(`${addressRoute}/byMetamask`, { account_metamask_address: currentAccount })
      setAccountWeapons(res.data)
    } catch (error) {
      console.log(error);
    }
  }
  const getWeaponsForSale = async() =>{
    try {
      const res = await axios.get(`${addressRoute}/getWeaponsForSale`)
      setWeaponsForSale(res.data)
    } catch (error) {
      console.log(error);
    }
  }
  const handleNewTransactionFromSale = async(weapon)=>{
    try {
      if (!ethereum) return alert("Please connect to MetaMask.");

      // new ethereum contract with the ABI and details of signer by the provider
      const tsxContract = createContractEth()
      //ethereum request for sending the new transaction with metamask
      await ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            
            from: currentAccount ,
            //sending the coins to the owner of the weapon
            to: weapon.account_metamask_address,
            //The value transferred for the transaction in WEI.
            //Parse the ether string representation of ether into a number instance of the amount of wei.
            value:ethers.utils.parseEther(String(weapon.weapon_price))._hex 
          },
        ],
      });
      const tsHash = await tsxContract.addToBlockchain(
         weapon.account_metamask_address,
         ethers.utils.parseEther(String(weapon.weapon_price))._hex ,
         weapon.weapon_name,
         weapon.weapon_type,
        weapon.weapon_url,
        weapon._id
      );
      await tsHash.wait()

      await axios.post(`${addressRoute}/updateAddress`, { account_metamask_address: currentAccount,_id:weapon._id })

    } catch (error) {
      console.log(error);
    }
  }

  //use effect that always checking whether a wallet is connected, the pages renders for every change.
  useEffect(() => {
    checkIfWalletConnected();
    getAccountWeapons();
  }, [currentAccount]);

  return (
    <TransactionContext.Provider
      value={{
        connectWallet,
        currentAccount,
        accountTransactions,
        accountWeapons,
        weaponsForSale,
        handleNewTransactionFromSale,
        getWeaponsForSale,
        handleWeaponForSale,
        handleTrainingPrice,
        handleWeaponIdleTime,
        getAccountWeapons,
        handleNewTransaction,
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
};
