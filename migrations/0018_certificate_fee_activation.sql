UPDATE student_fee_plan_items
SET is_active = 0
WHERE student_fee_plan_items.fee_category = 'Certificate Issue Fee'
  AND student_fee_plan_items.is_active = 1
  AND NOT EXISTS (
    SELECT 1 FROM fee_payments AS payment
    WHERE payment.student_id = student_fee_plan_items.student_id
      AND (payment.fee_plan_item_id = student_fee_plan_items.id OR payment.fee_category = 'Certificate Issue Fee')
  )
  AND NOT EXISTS (
    SELECT 1 FROM student_fee_payment_allocations AS allocation
    WHERE allocation.fee_plan_item_id = student_fee_plan_items.id
  );
