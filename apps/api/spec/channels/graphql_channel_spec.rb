require 'rails_helper'

RSpec.describe GraphqlChannel, type: :channel do
  describe '#subscribed' do
    it 'チャンネル接続が確立される' do
      subscribe
      expect(subscription).to be_confirmed
    end
  end

  describe '#execute' do
    before { subscribe }

    it 'GraphQLクエリを実行してresultをtransmitする' do
      mock_result = double(
        to_h: { 'data' => { 'transactions' => [] } },
        subscription?: false
      )
      allow(ApiSchema).to receive(:execute).and_return(mock_result)

      perform :execute, {
        'query' => '{ transactions { id } }',
        'variables' => {},
        'operationName' => nil
      }

      expect(transmissions.last).to eq({
        'result' => { 'data' => { 'transactions' => [] } },
        'more' => false
      })
    end

    it 'Subscriptionクエリの場合はmore: trueをtransmitする' do
      mock_result = double(
        to_h: { 'data' => nil },
        subscription?: true
      )
      allow(ApiSchema).to receive(:execute).and_return(mock_result)

      perform :execute, {
        'query' => 'subscription { notificationAdded { id } }',
        'variables' => {},
        'operationName' => nil
      }

      expect(transmissions.last['more']).to be true
    end
  end

  describe '#unsubscribed' do
    it 'subscription_idsに登録されたサブスクリプションを削除する' do
      subscribe

      subscription_id = 'test-subscription-id'
      subscription.instance_variable_set(:@subscription_ids, [subscription_id])

      expect(ApiSchema.subscriptions).to receive(:delete_subscription).with(subscription_id)

      unsubscribe
    end

    it 'subscription_idsが空の場合は何も削除しない' do
      subscribe
      expect(ApiSchema.subscriptions).not_to receive(:delete_subscription)
      unsubscribe
    end
  end
end
