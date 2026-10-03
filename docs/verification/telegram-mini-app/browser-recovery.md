# Browser recovery verification — 2 October 2026

The orchestrator used the real frontend in the local synthetic preview:

1. Open a manual form with merchant `RETRY SYNTHETIC`, amount `2.34`, category Other and a synthetic description.
2. Stop the preview server before submitting.
3. Submit through the actual browser form. The uncertain-response message appears, input freezes, and **Retry same save** is available.
4. Restart the synthetic server and click **Retry same save**, without reloading the page or replacing the form.
5. Observe successful save and editor closure. A read-only synthetic API lookup reports exactly one matching record, with `amount_minor=234`.

[Offline retry screenshot](offline-retry.jpg). This verifies browser-native form retry with disabled required fields. The separate automated lost-response test verifies persistence-before-response-loss and stable request ID/payload deduplication. No production database, bot or network setting was changed by this test.
