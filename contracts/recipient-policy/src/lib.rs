#![no_std]
//! Recipient and per-payment constraints layered with OpenZeppelin's budget policy.
use soroban_sdk::{
    auth::{Context, ContractContext},
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, TryFromVal, Vec,
};
use stellar_accounts::{
    policies::Policy,
    smart_account::{ContextRule, ContextRuleType, Signer},
};
#[contracttype]
#[derive(Clone, Debug)]
pub struct RecipientParams {
    pub token: Address,
    pub recipient: Address,
    pub per_payment: i128,
}
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RecipientError {
    InvalidConfiguration = 3900,
    NotInstalled = 3901,
    InvalidTransfer = 3902,
    WrongSource = 3903,
    WrongRecipient = 3904,
    InvalidAmount = 3905,
    NoSigner = 3906,
    AlreadyInstalled = 3907,
}
#[contract]
pub struct RecipientPolicy;
const TTL: u32 = 518400;
const TTL_THRESHOLD: u32 = 501120;
#[contractimpl]
impl Policy for RecipientPolicy {
    type AccountParams = RecipientParams;
    fn install(
        e: &Env,
        install_params: RecipientParams,
        rule: ContextRule,
        smart_account: Address,
    ) {
        smart_account.require_auth();
        if rule.context_type != ContextRuleType::CallContract(install_params.token.clone())
            || install_params.per_payment <= 0
            || install_params.recipient == smart_account
        {
            panic_with_error!(e, RecipientError::InvalidConfiguration);
        }
        let key = (smart_account, rule.id);
        if e.storage().persistent().has(&key) {
            panic_with_error!(e, RecipientError::AlreadyInstalled);
        }
        e.storage().persistent().set(&key, &install_params);
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL);
    }
    fn enforce(
        e: &Env,
        context: Context,
        authenticated_signers: Vec<Signer>,
        rule: ContextRule,
        smart_account: Address,
    ) {
        smart_account.require_auth();
        if authenticated_signers.is_empty() {
            panic_with_error!(e, RecipientError::NoSigner);
        }
        let key = (smart_account.clone(), rule.id);
        let params: RecipientParams = e
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(e, RecipientError::NotInstalled));
        let Context::Contract(ContractContext {
            contract,
            fn_name,
            args,
        }) = context
        else {
            panic_with_error!(e, RecipientError::InvalidTransfer)
        };
        if contract != params.token
            || rule.context_type != ContextRuleType::CallContract(params.token)
            || fn_name != symbol_short!("transfer")
            || args.len() != 3
        {
            panic_with_error!(e, RecipientError::InvalidTransfer);
        }
        let source = Address::try_from_val(e, &args.get_unchecked(0))
            .unwrap_or_else(|_| panic_with_error!(e, RecipientError::InvalidTransfer));
        let recipient = Address::try_from_val(e, &args.get_unchecked(1))
            .unwrap_or_else(|_| panic_with_error!(e, RecipientError::InvalidTransfer));
        let amount = i128::try_from_val(e, &args.get_unchecked(2))
            .unwrap_or_else(|_| panic_with_error!(e, RecipientError::InvalidTransfer));
        if source != smart_account {
            panic_with_error!(e, RecipientError::WrongSource);
        }
        if recipient != params.recipient {
            panic_with_error!(e, RecipientError::WrongRecipient);
        }
        if amount <= 0 || amount > params.per_payment {
            panic_with_error!(e, RecipientError::InvalidAmount);
        }
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL);
    }
    fn uninstall(e: &Env, rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();
        e.storage().persistent().remove(&(smart_account, rule.id));
    }
}
