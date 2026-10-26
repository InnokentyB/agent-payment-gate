#![no_std]
// Adapted from OpenZeppelin stellar-contracts v0.7.1 multisig example, MIT.
use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    Address, Env, Map, String, Symbol, Val, Vec,
};
use stellar_accounts::smart_account::{
    self, AuthPayload, ContextRule, ContextRuleType, ExecutionEntryPoint, Signer, SmartAccount,
    SmartAccountError,
};
#[contract]
pub struct GateAccount;
#[contractimpl]
impl GateAccount {
    pub fn __constructor(e: &Env, signers: Vec<Signer>, policies: Map<Address, Val>) {
        smart_account::add_context_rule(
            e,
            &ContextRuleType::Default,
            &String::from_str(e, "owner"),
            None,
            &signers,
            &policies,
        );
    }
}
#[contractimpl]
impl CustomAccountInterface for GateAccount {
    type Error = SmartAccountError;
    type Signature = AuthPayload;
    fn __check_auth(
        e: Env,
        signature_payload: Hash<32>,
        signatures: AuthPayload,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Self::Error> {
        smart_account::do_check_auth(&e, &signature_payload, &signatures, &auth_contexts)
    }
}
#[contractimpl(contracttrait)]
impl SmartAccount for GateAccount {}
#[contractimpl(contracttrait)]
impl ExecutionEntryPoint for GateAccount {}
