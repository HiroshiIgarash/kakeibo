class CreatePaceAlertSettings < ActiveRecord::Migration[8.1]
  def change
    create_table :pace_alert_settings do |t|
      t.references :category,       null: false, foreign_key: true
      t.boolean    :is_active,      null: false, default: true
      t.integer    :threshold,      null: false
      t.integer    :active_from_day, null: false, default: 5

      t.timestamps
    end
  end
end
