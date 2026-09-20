DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM payment_voids
    GROUP BY original_payment_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce payment void idempotency: duplicate original_payment_id values exist';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS payment_voids_original_payment_unique
  ON payment_voids(original_payment_id);
