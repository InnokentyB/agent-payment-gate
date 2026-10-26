#![no_std]
#[cfg(test)]
mod tests {
    extern crate std;
    use ed25519_dalek::{Signer as _, SigningKey};
    use gate_account::{GateAccount, GateAccountClient};
    use gate_recipient_policy::{RecipientParams, RecipientPolicy};
    use gate_spending_policy::SpendingLimitPolicyContract;
    use gate_verifier::Ed25519VerifierContract;
    use sha2::{Digest, Sha256};
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, vec,
        xdr::{self, ToXdr},
        Address, Bytes, Env, IntoVal, Map, String, TryFromVal, Val, Vec,
    };
    use stellar_accounts::{
        policies::spending_limit::SpendingLimitAccountParams,
        smart_account::{AuthPayload, ContextRuleType, Signer},
    };
    struct Fixture {
        e: Env,
        account: Address,
        token: Address,
        merchant: Address,
        verifier: Address,
        owner: SigningKey,
        agent: SigningKey,
        rule: u32,
        nonce: i64,
    }
    fn external(e: &Env, verifier: &Address, key: &SigningKey) -> Signer {
        Signer::External(
            verifier.clone(),
            Bytes::from_array(e, &key.verifying_key().to_bytes()),
        )
    }
    fn invocation(
        e: &Env,
        target: &Address,
        function: &str,
        args: Vec<Val>,
    ) -> xdr::SorobanAuthorizedInvocation {
        let xdr_args: std::vec::Vec<xdr::ScVal> = args
            .iter()
            .map(|v| xdr::ScVal::try_from_val(e, &v).unwrap())
            .collect();
        xdr::SorobanAuthorizedInvocation {
            function: xdr::SorobanAuthorizedFunction::ContractFn(xdr::InvokeContractArgs {
                contract_address: xdr::ScAddress::from(target),
                function_name: function.try_into().unwrap(),
                args: xdr_args.try_into().unwrap(),
            }),
            sub_invocations: std::vec![].try_into().unwrap(),
        }
    }
    fn make_auth(
        f: &mut Fixture,
        key: &SigningKey,
        rule: u32,
        invocation: xdr::SorobanAuthorizedInvocation,
    ) -> xdr::SorobanAuthorizationEntry {
        use xdr::WriteXdr;
        f.nonce += 1;
        let expiration = f.e.ledger().sequence() + 100;
        let preimage =
            xdr::HashIdPreimage::SorobanAuthorization(xdr::HashIdPreimageSorobanAuthorization {
                network_id: xdr::Hash(f.e.ledger().network_id().to_array()),
                nonce: f.nonce,
                signature_expiration_ledger: expiration,
                invocation: invocation.clone(),
            });
        let host_hash = Sha256::digest(preimage.to_xdr(xdr::Limits::none()).unwrap());
        let rule_ids = vec![&f.e, rule];
        let mut digest_input = host_hash.to_vec();
        digest_input.extend(rule_ids.clone().to_xdr(&f.e).iter());
        let signature = key.sign(&Sha256::digest(digest_input)).to_bytes();
        let payload = AuthPayload {
            signers: soroban_sdk::map![
                &f.e,
                (
                    external(&f.e, &f.verifier, key),
                    Bytes::from_array(&f.e, &signature)
                )
            ],
            context_rule_ids: rule_ids,
        };
        let val: Val = payload.into_val(&f.e);
        xdr::SorobanAuthorizationEntry {
            credentials: xdr::SorobanCredentials::Address(xdr::SorobanAddressCredentials {
                address: xdr::ScAddress::from(&f.account),
                nonce: f.nonce,
                signature_expiration_ledger: expiration,
                signature: xdr::ScVal::try_from_val(&f.e, &val).unwrap(),
            }),
            root_invocation: invocation,
        }
    }
    fn setup() -> Fixture {
        let e = Env::default();
        e.ledger().with_mut(|l| l.sequence_number = 100);
        let verifier = e.register(Ed25519VerifierContract, ());
        let owner = SigningKey::from_bytes(&[1; 32]);
        let agent = SigningKey::from_bytes(&[2; 32]);
        let account = e.register(
            GateAccount,
            (
                vec![&e, external(&e, &verifier, &owner)],
                Map::<Address, Val>::new(&e),
            ),
        );
        let admin = Address::generate(&e);
        let token = e.register_stellar_asset_contract_v2(admin).address();
        e.mock_all_auths();
        token::StellarAssetClient::new(&e, &token).mint(&account, &1_000_000_000);
        e.set_auths(&[]);
        let merchant = Address::generate(&e);
        let recipient_policy = e.register(RecipientPolicy, ());
        let spending_policy = e.register(SpendingLimitPolicyContract, ());
        let policies = soroban_sdk::map![
            &e,
            (
                recipient_policy,
                RecipientParams {
                    token: token.clone(),
                    recipient: merchant.clone(),
                    per_payment: 20_000_000
                }
                .into_val(&e)
            ),
            (
                spending_policy,
                SpendingLimitAccountParams {
                    spending_limit: 50_000_000,
                    period_ledgers: 1000
                }
                .into_val(&e)
            )
        ];
        let mut f = Fixture {
            e,
            account,
            token,
            merchant,
            verifier,
            owner,
            agent,
            rule: 1,
            nonce: 0,
        };
        let args = (
            ContextRuleType::CallContract(f.token.clone()),
            String::from_str(&f.e, "agent"),
            Some(5000u32),
            vec![&f.e, external(&f.e, &f.verifier, &f.agent)],
            policies.clone(),
        )
            .into_val(&f.e);
        let inv = invocation(&f.e, &f.account, "add_context_rule", args);
        let key = f.owner.clone();
        let entry = make_auth(&mut f, &key, 0, inv);
        f.e.set_auths(&[entry]);
        let rule = GateAccountClient::new(&f.e, &f.account).add_context_rule(
            &ContextRuleType::CallContract(f.token.clone()),
            &String::from_str(&f.e, "agent"),
            &Some(5000),
            &vec![&f.e, external(&f.e, &f.verifier, &f.agent)],
            &policies,
        );
        f.rule = rule.id;
        f.e.set_auths(&[]);
        f
    }
    fn pay(f: &mut Fixture, to: Address, amount: i128) -> bool {
        let inv = invocation(
            &f.e,
            &f.token,
            "transfer",
            (f.account.clone(), to.clone(), amount).into_val(&f.e),
        );
        let key = f.agent.clone();
        let rule = f.rule;
        let entry = make_auth(f, &key, rule, inv);
        f.e.set_auths(&[entry]);
        token::Client::new(&f.e, &f.token)
            .try_transfer(&f.account, &to, &amount)
            .is_ok()
    }
    #[test]
    fn allowed_payment_moves_tokens() {
        let mut f = setup();
        let to = f.merchant.clone();
        assert!(pay(&mut f, to.clone(), 20_000_000));
        assert_eq!(token::Client::new(&f.e, &f.token).balance(&to), 20_000_000);
    }
    #[test]
    fn recipient_is_enforced() {
        let mut f = setup();
        let to = Address::generate(&f.e);
        assert!(!pay(&mut f, to.clone(), 1));
        assert_eq!(token::Client::new(&f.e, &f.token).balance(&to), 0);
    }
    #[test]
    fn per_payment_is_enforced() {
        let mut f = setup();
        let to = f.merchant.clone();
        assert!(!pay(&mut f, to, 20_000_001));
    }
    #[test]
    fn zero_is_rejected() {
        let mut f = setup();
        let to = f.merchant.clone();
        assert!(!pay(&mut f, to, 0));
    }
    #[test]
    fn negative_is_rejected() {
        let mut f = setup();
        let to = f.merchant.clone();
        assert!(!pay(&mut f, to, -1));
    }
    #[test]
    fn budget_is_cumulative_and_failure_does_not_consume_it() {
        let mut f = setup();
        let to = f.merchant.clone();
        assert!(pay(&mut f, to.clone(), 20_000_000));
        assert!(pay(&mut f, to.clone(), 20_000_000));
        assert!(!pay(&mut f, to.clone(), 20_000_000));
        assert!(pay(&mut f, to.clone(), 10_000_000));
        assert_eq!(token::Client::new(&f.e, &f.token).balance(&to), 50_000_000);
    }
    #[test]
    fn budget_releases_after_rolling_window() {
        let mut f = setup();
        let to = f.merchant.clone();
        assert!(pay(&mut f, to.clone(), 20_000_000));
        assert!(pay(&mut f, to.clone(), 20_000_000));
        assert!(pay(&mut f, to.clone(), 10_000_000));
        f.e.ledger().with_mut(|l| l.sequence_number = 1100);
        assert!(pay(&mut f, to, 20_000_000));
    }
    #[test]
    fn expired_permission_blocks_payment() {
        let mut f = setup();
        f.e.ledger().with_mut(|l| l.sequence_number = 5001);
        let to = f.merchant.clone();
        assert!(!pay(&mut f, to, 1));
    }
    #[test]
    fn owner_can_revoke_agent() {
        let mut f = setup();
        let inv = invocation(
            &f.e,
            &f.account,
            "remove_context_rule",
            (f.rule,).into_val(&f.e),
        );
        let key = f.owner.clone();
        let entry = make_auth(&mut f, &key, 0, inv);
        f.e.set_auths(&[entry]);
        GateAccountClient::new(&f.e, &f.account).remove_context_rule(&f.rule);
        let to = f.merchant.clone();
        assert!(!pay(&mut f, to, 1));
    }
    #[test]
    fn agent_cannot_manage_permissions() {
        let mut f = setup();
        let inv = invocation(
            &f.e,
            &f.account,
            "remove_context_rule",
            (f.rule,).into_val(&f.e),
        );
        let key = f.agent.clone();
        let rule = f.rule;
        let entry = make_auth(&mut f, &key, rule, inv);
        f.e.set_auths(&[entry]);
        assert!(GateAccountClient::new(&f.e, &f.account)
            .try_remove_context_rule(&f.rule)
            .is_err());
        let to = f.merchant.clone();
        assert!(pay(&mut f, to, 1));
    }
    #[test]
    fn unknown_key_cannot_pay() {
        let mut f = setup();
        f.agent = SigningKey::from_bytes(&[3; 32]);
        let to = f.merchant.clone();
        assert!(!pay(&mut f, to, 1));
    }
    #[test]
    fn signature_binds_amount() {
        let mut f = setup();
        let to = f.merchant.clone();
        let inv = invocation(
            &f.e,
            &f.token,
            "transfer",
            (f.account.clone(), to.clone(), 1i128).into_val(&f.e),
        );
        let key = f.agent.clone();
        let rule = f.rule;
        let entry = make_auth(&mut f, &key, rule, inv);
        f.e.set_auths(&[entry]);
        assert!(token::Client::new(&f.e, &f.token)
            .try_transfer(&f.account, &to, &2)
            .is_err());
        assert_eq!(token::Client::new(&f.e, &f.token).balance(&to), 0);
    }
    #[test]
    fn signed_entry_cannot_be_replayed() {
        let mut f = setup();
        let to = f.merchant.clone();
        let inv = invocation(
            &f.e,
            &f.token,
            "transfer",
            (f.account.clone(), to.clone(), 1i128).into_val(&f.e),
        );
        let key = f.agent.clone();
        let rule = f.rule;
        let entry = make_auth(&mut f, &key, rule, inv);
        f.e.set_auths(&[entry.clone()]);
        token::Client::new(&f.e, &f.token).transfer(&f.account, &to, &1);
        f.e.set_auths(&[entry]);
        assert!(token::Client::new(&f.e, &f.token)
            .try_transfer(&f.account, &to, &1)
            .is_err());
        assert_eq!(token::Client::new(&f.e, &f.token).balance(&to), 1);
    }
    #[test]
    fn different_token_is_rejected() {
        let mut f = setup();
        let other =
            f.e.register_stellar_asset_contract_v2(Address::generate(&f.e))
                .address();
        f.e.mock_all_auths();
        token::StellarAssetClient::new(&f.e, &other).mint(&f.account, &100);
        f.e.set_auths(&[]);
        let to = f.merchant.clone();
        let inv = invocation(
            &f.e,
            &other,
            "transfer",
            (f.account.clone(), to.clone(), 1i128).into_val(&f.e),
        );
        let key = f.agent.clone();
        let rule = f.rule;
        let entry = make_auth(&mut f, &key, rule, inv);
        f.e.set_auths(&[entry]);
        assert!(token::Client::new(&f.e, &other)
            .try_transfer(&f.account, &to, &1)
            .is_err());
    }
    #[test]
    fn javascript_auth_payload_matches_pinned_oz_abi() {
        use xdr::ReadXdr;
        let e = Env::default();
        let hex = include_str!("../fixtures/js-auth.hex").trim();
        let raw: std::vec::Vec<u8> = hex
            .as_bytes()
            .chunks_exact(2)
            .map(|pair| u8::from_str_radix(core::str::from_utf8(pair).unwrap(), 16).unwrap())
            .collect();
        let scval = xdr::ScVal::from_xdr(raw, xdr::Limits::none()).unwrap();
        let value = Val::try_from_val(&e, &scval).unwrap();
        let payload = AuthPayload::try_from_val(&e, &value).unwrap();
        assert_eq!(payload.context_rule_ids, vec![&e, 1u32]);
        assert_eq!(payload.signers.len(), 1);
        let (signer, signature) = payload.signers.iter().next().unwrap();
        let Signer::External(verifier, public_key) = signer else {
            panic!("external signer expected")
        };
        let expected_verifier = Address::try_from_val(
            &e,
            &xdr::ScAddress::Contract(xdr::ContractId(xdr::Hash([3u8; 32]))),
        )
        .unwrap();
        assert_eq!(verifier, expected_verifier);
        assert_eq!(
            public_key,
            Bytes::from_array(
                &e,
                &SigningKey::from_bytes(&[2; 32]).verifying_key().to_bytes()
            )
        );
        let mut preimage = Bytes::from_array(&e, &[7u8; 32]);
        preimage.append(&payload.context_rule_ids.to_xdr(&e));
        let digest = e.crypto().sha256(&preimage);
        e.crypto().ed25519_verify(
            &soroban_sdk::BytesN::try_from(&public_key).unwrap(),
            &digest.to_bytes().to_bytes(),
            &soroban_sdk::BytesN::try_from(&signature).unwrap(),
        );
    }
    #[test]
    fn rule_selection_cannot_be_swapped_after_signing() {
        let mut f = setup();
        let signers = vec![&f.e, external(&f.e, &f.verifier, &f.agent)];
        let policies = Map::<Address, Val>::new(&f.e);
        let context = ContextRuleType::CallContract(f.token.clone());
        let name = String::from_str(&f.e, "second agent rule");
        let expiry = Some(5000u32);
        let inv = invocation(
            &f.e,
            &f.account,
            "add_context_rule",
            (
                context.clone(),
                name.clone(),
                expiry,
                signers.clone(),
                policies.clone(),
            )
                .into_val(&f.e),
        );
        let key = f.owner.clone();
        let entry = make_auth(&mut f, &key, 0, inv);
        f.e.set_auths(&[entry]);
        let other = GateAccountClient::new(&f.e, &f.account)
            .add_context_rule(&context, &name, &expiry, &signers, &policies);
        let to = f.merchant.clone();
        let inv = invocation(
            &f.e,
            &f.token,
            "transfer",
            (f.account.clone(), to.clone(), 1i128).into_val(&f.e),
        );
        let key = f.agent.clone();
        let rule = f.rule;
        let mut entry = make_auth(&mut f, &key, rule, inv);
        if let xdr::SorobanCredentials::Address(ref mut credentials) = entry.credentials {
            let value = Val::try_from_val(&f.e, &credentials.signature).unwrap();
            let mut payload = AuthPayload::try_from_val(&f.e, &value).unwrap();
            payload.context_rule_ids = vec![&f.e, other.id];
            let value: Val = payload.into_val(&f.e);
            credentials.signature = xdr::ScVal::try_from_val(&f.e, &value).unwrap();
        } else {
            panic!("address credentials expected");
        }
        f.e.set_auths(&[entry]);
        assert!(token::Client::new(&f.e, &f.token)
            .try_transfer(&f.account, &to, &1)
            .is_err());
        assert_eq!(token::Client::new(&f.e, &f.token).balance(&to), 0);
    }
}
