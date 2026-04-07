class CreateUnclassifiedAlerts < ActiveRecord::Migration[8.1]
  def change
    create_table :unclassified_alerts do |t|
      t.integer :count, null: false

      t.timestamps
    end
  end
end
