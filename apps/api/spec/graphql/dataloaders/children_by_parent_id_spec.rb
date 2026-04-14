# frozen_string_literal: true

require "rails_helper"

RSpec.describe Dataloaders::ChildrenByParentId do
  describe "#fetch" do
    let!(:parent1) { create(:category) }
    let!(:parent2) { create(:category) }
    let!(:child1a) { create(:category, parent: parent1) }
    let!(:child1b) { create(:category, parent: parent1) }
    let!(:child2a) { create(:category, parent: parent2) }

    it "parent_idに対応する子カテゴリ一覧を返す" do
      results = {}
      dl = GraphQL::Dataloader.new
      dl.run_isolated do
        source = dl.with(described_class)
        p1 = source.load(parent1.id)
        p2 = source.load(parent2.id)
        results[parent1.id] = p1
        results[parent2.id] = p2
      end
      expect(results[parent1.id]).to contain_exactly(child1a, child1b)
      expect(results[parent2.id]).to contain_exactly(child2a)
    end

    it "子カテゴリがない場合は空配列を返す" do
      childless = create(:category)
      result = nil
      dl = GraphQL::Dataloader.new
      dl.run_isolated do
        result = dl.with(described_class).load(childless.id)
      end
      expect(result).to eq([])
    end
  end
end
