class CreateAlertSettings < ActiveRecord::Migration[8.1]
  def change
    create_table :alert_settings do |t|
      t.references :category,  null: true, foreign_key: true
      t.integer    :threshold, null: false
      t.boolean    :is_active, null: false, default: true

      t.timestamps
    end
  end
end
