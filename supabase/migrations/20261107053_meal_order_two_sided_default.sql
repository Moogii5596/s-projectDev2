-- v0.2.4: accepted meal-order changes require the other party's approval by default.
ALTER TABLE camp_settings
  ALTER COLUMN meal_order_edit_after_accept SET DEFAULT 'TWO_SIDED';

UPDATE camp_settings
SET meal_order_edit_after_accept = 'TWO_SIDED'
WHERE meal_order_edit_after_accept <> 'TWO_SIDED';
